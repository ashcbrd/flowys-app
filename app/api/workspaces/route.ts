import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getOrCreatePersonalWorkspace } from "@/lib/workspaces/service";
import { listUserWorkspaces, createSharedWorkspace, MemberError } from "@/lib/workspaces/members";

/** Every workspace the caller belongs to, personal first. */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Guarantees at least one row for a brand new account, so the UI never has
    // to render an empty workspace switcher.
    await getOrCreatePersonalWorkspace(user.id);

    return NextResponse.json(await listUserWorkspaces(user.id));
  } catch (error) {
    console.error("Error listing workspaces:", error);
    return NextResponse.json({ error: "Failed to list workspaces" }, { status: 500 });
  }
}

/** Create a shared workspace. The caller becomes its owner. */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const id = await createSharedWorkspace(user.id, String(body?.name ?? ""));

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof MemberError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating workspace:", error);
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }
}
