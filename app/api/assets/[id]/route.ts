import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Asset } from "@/lib/db/models/Asset";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

/**
 * Serves a stored asset: a generated image, a mockup, an email preview.
 *
 * The id in the URL carries an extension ("<uuid>.png") purely so the result
 * renderer can tell an image from a page without a round trip; the extension
 * is stripped here and the stored contentType is what actually goes out.
 *
 * Access: a session always, then the owner, then anyone who shares the
 * owner's personal workspace, which is how a teammate running a published app
 * sees the images that run produced. Everyone else gets 404 rather than 403,
 * because "this exists but not for you" is more than a stranger should learn
 * from an id.
 *
 * Email previews are model-filled HTML. Every slot was escaped at render
 * time; the sandbox CSP here is the second lock, so even an escape bug
 * cannot script, submit, or navigate.
 */
type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = rawId.replace(/\.\w+$/, "");

  await connectToDatabase();

  const asset = await Asset.findById(id)
    .select({ userId: 1, contentType: 1, data: 1, kind: 1 })
    .lean();

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (asset.userId !== user.id) {
    const allowed = await sharesOwnersWorkspace(asset.userId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // A lean() query can hand the bytes back as a raw BSON binary rather than a
  // Node Buffer, depending on driver version. Normalise before serving.
  const bytes = Buffer.isBuffer(asset.data)
    ? asset.data
    : Buffer.from((asset.data as { buffer: Uint8Array }).buffer ?? asset.data);

  const headers: Record<string, string> = {
    "Content-Type": asset.contentType,
    "Content-Length": String(bytes.length),
    // The id is immutable and the bytes never change, so a browser may keep
    // them; private because the response required a session.
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
  };

  if (asset.kind === "email") {
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:";
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers,
  });
}

async function sharesOwnersWorkspace(
  ownerId: string,
  viewerId: string
): Promise<boolean> {
  // Imported lazily so the module graph of this route stays small; the
  // common case (owner viewing their own run) never touches workspaces.
  const { getOrCreatePersonalWorkspace, getWorkspaceRole } = await import(
    "@/lib/workspaces/service"
  );

  const workspaceId = await getOrCreatePersonalWorkspace(ownerId);
  const role = await getWorkspaceRole(workspaceId, viewerId);
  return role !== null;
}
