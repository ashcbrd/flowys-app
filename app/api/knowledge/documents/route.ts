import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, KnowledgeDocument } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getOrCreatePersonalWorkspace } from "@/lib/workspaces/service";
import { ingestText, getOrCreateDefaultKnowledgeBase } from "@/lib/knowledge/ingest";

/** Documents in the caller's own workspace. Never anyone else's. */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const workspaceId = await getOrCreatePersonalWorkspace(user.id);

    const documents = await KnowledgeDocument.find({ workspaceId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      documents.map((doc) => ({
        id: doc._id,
        title: doc.title,
        status: doc.status,
        error: doc.error,
        chunkCount: doc.chunkCount,
        knowledgeBaseId: doc.knowledgeBaseId,
        createdAt: doc.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error listing documents:", error);
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 });
  }
}

const MAX_CHARS = 200_000;

/** Add a document: chunk it, embed it, index it. */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const text = typeof body?.text === "string" ? body.text : "";

    if (!title) {
      return NextResponse.json({ error: "A title is required" }, { status: 400 });
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "There is no text to add" }, { status: 400 });
    }
    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `That document is too long. The limit is ${MAX_CHARS.toLocaleString()} characters.` },
        { status: 413 }
      );
    }

    await connectToDatabase();
    const workspaceId = await getOrCreatePersonalWorkspace(user.id);
    const knowledgeBaseId =
      typeof body?.knowledgeBaseId === "string" && body.knowledgeBaseId
        ? body.knowledgeBaseId
        : await getOrCreateDefaultKnowledgeBase(workspaceId);

    const result = await ingestText({ workspaceId, knowledgeBaseId, title, text });

    // A failed ingest is a real answer, not a server error: the document row
    // exists and carries the reason, which is what the UI shows.
    return NextResponse.json(result, { status: result.status === "ready" ? 201 : 422 });
  } catch (error) {
    console.error("Error adding document:", error);
    const message = error instanceof Error ? error.message : "Failed to add document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
