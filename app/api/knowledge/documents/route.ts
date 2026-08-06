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

/**
 * Add a document. Three sources, one pipeline:
 *
 *   pasted text     -> JSON  { title, text }
 *   a web page      -> JSON  { url }
 *   an uploaded file -> multipart/form-data with a `file` field
 *
 * All three end in `ingestText`, so chunking, embedding, indexing and the
 * ready/failed state machine behave identically regardless of source.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const workspaceId = await getOrCreatePersonalWorkspace(user.id);

    const contentType = request.headers.get("content-type") ?? "";

    // Uploaded file.
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file arrived" }, { status: 400 });
      }

      const knowledgeBaseId = await resolveKnowledgeBase(form.get("knowledgeBaseId"), workspaceId);
      const { ingestFile } = await import("@/lib/knowledge/ingest");

      const result = await ingestFile({
        workspaceId,
        knowledgeBaseId,
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        meterToUserId: user.id,
      });
      return NextResponse.json(result, { status: statusFor(result.status) });
    }

    const body = await request.json().catch(() => null);
    const knowledgeBaseId = await resolveKnowledgeBase(body?.knowledgeBaseId, workspaceId);

    // A web page.
    if (typeof body?.url === "string" && body.url.trim()) {
      const { ingestUrl } = await import("@/lib/knowledge/ingest");
      const result = await ingestUrl({
        workspaceId,
        knowledgeBaseId,
        url: body.url.trim(),
        meterToUserId: user.id,
      });
      return NextResponse.json(result, { status: statusFor(result.status) });
    }

    // Pasted text.
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

    const result = await ingestText({
      workspaceId,
      knowledgeBaseId,
      title,
      text,
      meterToUserId: user.id,
    });

    return NextResponse.json(result, { status: statusFor(result.status) });
  } catch (error) {
    console.error("Error adding document:", error);
    const message = error instanceof Error ? error.message : "Failed to add document";
    // Extraction and vetting failures are user-actionable messages, not 500s.
    const userFacing =
      error instanceof Error &&
      /cannot be read|not a valid web address|private network|answered \d+|too large|is empty|over \d+ MB|No text could be read|No readable text/.test(
        error.message
      );
    return NextResponse.json({ error: message }, { status: userFacing ? 422 : 500 });
  }
}

/**
 * Three outcomes, three codes.
 *
 * `pending` is a success: the document was accepted and a worker will index
 * it. It previously shared the failure branch and answered 422, so the page
 * told the user "Could not add that document" about a document that had been
 * queued perfectly well, and then listed it below.
 *
 * A failed ingest is still not a server error: the row exists and carries the
 * reason, which is what the UI shows.
 */
function statusFor(status: "ready" | "pending" | "failed"): number {
  if (status === "ready") return 201;
  if (status === "pending") return 202;
  return 422;
}

async function resolveKnowledgeBase(value: unknown, workspaceId: string): Promise<string> {
  return typeof value === "string" && value
    ? value
    : getOrCreateDefaultKnowledgeBase(workspaceId);
}
