import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getWorkspaceRole } from "@/lib/workspaces/service";
import {
  listMembers,
  addMember,
  changeRole,
  removeMember,
  MemberError,
} from "@/lib/workspaces/members";
import type { Role } from "@/lib/db/models/Membership";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Every route here answers 403 for a non-member rather than 404, because the
 * caller has supplied a workspace id and either belongs to it or does not;
 * there is nothing to hide by pretending it is absent.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Seeing who else is in a workspace is available to every member, not just
    // managers: you cannot sensibly share a document with someone you cannot
    // see.
    const role = await getWorkspaceRole(id, user.id);
    if (!role) return NextResponse.json({ error: "Not a member" }, { status: 403 });

    return NextResponse.json({ role, members: await listMembers(id) });
  } catch (error) {
    console.error("Error listing members:", error);
    return NextResponse.json({ error: "Failed to list members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);

    const member = await addMember(
      id,
      user.id,
      String(body?.email ?? ""),
      (body?.role ?? "member") as Role
    );
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return handle(error, "Failed to add that person");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => null);

    await changeRole(id, user.id, String(body?.userId ?? ""), body?.role as Role);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handle(error, "Failed to change that role");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const targetUserId = new URL(request.url).searchParams.get("userId");
    if (!targetUserId) {
      return NextResponse.json({ error: "Say who to remove" }, { status: 400 });
    }

    await removeMember(id, user.id, targetUserId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handle(error, "Failed to remove that person");
  }
}

/**
 * MemberError carries a message written for the person reading it and the
 * status that matches. Anything else is a bug, so it is logged and generalised.
 */
function handle(error: unknown, fallback: string) {
  if (error instanceof MemberError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
