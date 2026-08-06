import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getWorkspaceRole } from "@/lib/workspaces/service";
import { listAudit } from "@/lib/workspaces/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * The workspace's administrative history.
 *
 * Owners and admins only. The log names who granted whom access to what, which
 * is exactly the information a member should not be able to browse casually.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const role = await getWorkspaceRole(id, user.id);
    if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only owners and admins can see the workspace history" },
        { status: 403 }
      );
    }

    const entries = await listAudit(id);
    return NextResponse.json(
      entries.map((e) => ({
        id: e._id,
        action: e.action,
        actorId: e.actorId,
        summary: e.summary,
        at: e.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error listing audit log:", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
