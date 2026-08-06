import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, KnowledgeDocument } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getWorkspaceRole } from "@/lib/workspaces/service";
import { deleteDocument } from "@/lib/knowledge/ingest";
import { recordAudit } from "@/lib/workspaces/audit";
import type { Role } from "@/lib/db/models/Membership";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MANAGE_ROLES: Role[] = ["owner", "admin"];

/**
 * Who can change a document's access rules.
 *
 * Restricted to owners and admins deliberately. A member being able to widen a
 * document from restricted to workspace-visible would make per-document access
 * advisory rather than enforced, and the person who narrowed it would never
 * find out it had been widened again.
 */
async function loadManageable(documentId: string, userId: string) {
  await connectToDatabase();

  const document = await KnowledgeDocument.findById(documentId).lean();
  if (!document) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const role = await getWorkspaceRole(document.workspaceId, userId);
  // A non-member gets 404, not 403: they supplied an id they have no business
  // knowing exists, and confirming it does is a leak.
  if (!role) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  if (!MANAGE_ROLES.includes(role)) {
    return {
      error: NextResponse.json(
        { error: "Only owners and admins can change who can read a document" },
        { status: 403 }
      ),
    };
  }

  return { document };
}

/** Change who can read this document. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const loaded = await loadManageable(id, user.id);
    if (loaded.error) return loaded.error;

    const body = await request.json().catch(() => null);
    const mode = body?.acl?.mode;

    if (mode !== "workspace" && mode !== "restricted") {
      return NextResponse.json(
        { error: "Access must be either everyone in the workspace, or specific people" },
        { status: 400 }
      );
    }

    if (mode === "workspace") {
      // Clear the lists rather than leaving them behind: a document flipped
      // back to restricted later should start from nothing, not silently
      // reinstate an allow-list from months ago.
      await KnowledgeDocument.updateOne(
        { _id: id },
        { acl: { mode: "workspace", allowedUserIds: undefined, allowedRoles: undefined } }
      );
      await recordAudit({
        workspaceId: loaded.document!.workspaceId,
        actorId: user.id,
        action: "document.access_changed",
        targetId: id,
        summary: `Opened "${loaded.document!.title}" to everyone in the workspace`,
      });
      return NextResponse.json({ acl: { mode: "workspace" } });
    }

    const allowedUserIds: string[] = Array.isArray(body.acl.allowedUserIds)
      ? [
          ...new Set(
            (body.acl.allowedUserIds as unknown[]).filter(
              (v): v is string => typeof v === "string"
            )
          ),
        ]
      : [];
    const allowedRoles: Role[] = Array.isArray(body.acl.allowedRoles)
      ? body.acl.allowedRoles.filter((v: unknown): v is Role =>
          ["owner", "admin", "member", "viewer"].includes(v as string)
        )
      : [];

    if (allowedUserIds.length === 0 && allowedRoles.length === 0) {
      return NextResponse.json(
        {
          error:
            "Restricting a document to nobody would hide it from you too. Pick at least one person or role.",
        },
        { status: 400 }
      );
    }

    await KnowledgeDocument.updateOne(
      { _id: id },
      { acl: { mode: "restricted", allowedUserIds, allowedRoles } }
    );

    await recordAudit({
      workspaceId: loaded.document!.workspaceId,
      actorId: user.id,
      action: "document.access_changed",
      targetId: id,
      summary: `Restricted "${loaded.document!.title}" to ${allowedUserIds.length} person(s) and ${allowedRoles.length} role(s)`,
    });

    return NextResponse.json({ acl: { mode: "restricted", allowedUserIds, allowedRoles } });
  } catch (error) {
    console.error("Error updating document access:", error);
    return NextResponse.json({ error: "Failed to update access" }, { status: 500 });
  }
}

/** Delete a document and everything indexed from it. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const loaded = await loadManageable(id, user.id);
    if (loaded.error) return loaded.error;

    await deleteDocument(loaded.document!.workspaceId, id);
    await recordAudit({
      workspaceId: loaded.document!.workspaceId,
      actorId: user.id,
      action: "document.deleted",
      targetId: id,
      summary: `Deleted "${loaded.document!.title}"`,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}

/**
 * Re-index a document from new text.
 *
 * A document whose source changed had no path back into the index: the old
 * chunks stayed and kept answering from a version nobody could see any more.
 * This resets it to `pending` and lets the processor rebuild it, which also
 * means a large re-index does not block the request that asked for it.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const loaded = await loadManageable(id, user.id);
    if (loaded.error) return loaded.error;

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "There is no text to index" }, { status: 400 });
    }

    await KnowledgeDocument.updateOne(
      { _id: id },
      {
        status: "pending",
        pendingText: text,
        attempts: 0,
        chunkCount: 0,
        meteredToUserId: user.id,
        $unset: { error: "", claimedAt: "" },
      }
    );

    return NextResponse.json({ documentId: id, status: "pending" });
  } catch (error) {
    console.error("Error re-indexing document:", error);
    return NextResponse.json({ error: "Failed to re-index" }, { status: 500 });
  }
}
