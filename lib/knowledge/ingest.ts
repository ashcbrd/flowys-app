/**
 * Turn a document into searchable chunks.
 *
 * The `Document` state machine is the whole design: `pending -> processing ->
 * ready | failed`. Nothing is ever half-indexed and searchable, because
 * retrieval only ever queries documents in `ready`. A crash mid-ingest leaves
 * the document in `processing`, which is visible in the UI and excluded from
 * search, rather than leaving a document that answers questions from a third
 * of its content.
 *
 * Re-ingesting the same document deletes its old chunks first. Without that, an
 * edited document answers from both versions at once, and the stale half often
 * scores higher because it is longer.
 */
import { connectToDatabase, Chunk, KnowledgeDocument, KnowledgeBase } from "@/lib/db";
import { chunkText } from "@/lib/knowledge/chunker";
import { getEmbeddingProvider, EMBEDDING_DIMENSIONS } from "@/lib/knowledge/embeddings";
import { VECTOR_INDEX_NAME } from "@/lib/knowledge/retrieval";

export interface IngestTextOptions {
  workspaceId: string;
  knowledgeBaseId: string;
  title: string;
  text: string;
  /** Defaults to the knowledge base's own visibility. */
  acl?: { mode: "workspace" | "restricted"; allowedUserIds?: string[]; allowedRoles?: string[] };
  /** Charge indexing to this account. Omitted for internal or test ingestion. */
  meterToUserId?: string;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  status: "ready" | "failed";
  error?: string;
}

/**
 * Ingest plain text or markdown.
 *
 * Extraction from PDF and DOCX is a separate layer that produces this same
 * text; everything downstream of that is here, so the two share one code path
 * and one state machine.
 */
export async function ingestText(options: IngestTextOptions): Promise<IngestResult> {
  const { workspaceId, knowledgeBaseId, title, text } = options;

  await connectToDatabase();

  const base = await KnowledgeBase.findOne({ _id: knowledgeBaseId, workspaceId }).lean();
  if (!base) throw new Error("Knowledge base not found in this workspace");

  const document = await KnowledgeDocument.create({
    workspaceId,
    knowledgeBaseId,
    source: { type: "upload", ref: title },
    title,
    status: "processing",
    acl: options.acl ?? { mode: base.defaultVisibility },
    chunkCount: 0,
  });

  try {
    const pieces = chunkText(text);
    if (pieces.length === 0) {
      // A document that extracted to nothing is a failure, not an empty
      // success. Marking it ready would mean it silently answers nothing.
      await KnowledgeDocument.updateOne(
        { _id: document._id },
        { status: "failed", error: "No readable text found in this document" }
      );
      return {
        documentId: document._id,
        chunkCount: 0,
        status: "failed",
        error: "No readable text found in this document",
      };
    }

    const vectors = await getEmbeddingProvider().embed(pieces.map((p) => p.text));

    // Replace, never append. An edited document that keeps its old chunks
    // answers from both versions at once.
    await Chunk.deleteMany({ documentId: document._id });

    await Chunk.insertMany(
      pieces.map((piece, i) => ({
        workspaceId,
        knowledgeBaseId,
        documentId: document._id,
        ord: piece.ord,
        text: piece.text,
        heading: piece.heading,
        embedding: vectors[i],
        tokens: piece.tokens,
      }))
    );

    // Written is not the same as searchable. The Atlas index is eventually
    // consistent, so a document marked ready the instant its rows land answers
    // "I could not find anything about that" to the very first question. Wait
    // for the index to actually see it, then say ready.
    await waitUntilSearchable(document._id);

    await KnowledgeDocument.updateOne(
      { _id: document._id },
      { status: "ready", chunkCount: pieces.length, error: undefined }
    );

    // Metered after success and on the real chunk count, not an estimate taken
    // up front. A document that fails extraction costs the user nothing, which
    // is the only version they would accept.
    if (options.meterToUserId) {
      const { deductCredits, calculateIndexingCost } = await import("@/lib/credits");
      await deductCredits(options.meterToUserId, calculateIndexingCost(pieces.length));
    }

    return { documentId: document._id, chunkCount: pieces.length, status: "ready" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";

    // Leave nothing half-indexed behind a failure.
    await Chunk.deleteMany({ documentId: document._id });
    await KnowledgeDocument.updateOne(
      { _id: document._id },
      { status: "failed", error: message, chunkCount: 0 }
    );

    return { documentId: document._id, chunkCount: 0, status: "failed", error: message };
  }
}

export interface IngestFileOptions {
  workspaceId: string;
  knowledgeBaseId: string;
  filename: string;
  buffer: Buffer;
  meterToUserId?: string;
}

/** Ingest an uploaded file: extract, then share the text pipeline. */
export async function ingestFile(options: IngestFileOptions): Promise<IngestResult> {
  const { extractFromFile } = await import("@/lib/knowledge/extract");
  const extracted = await extractFromFile(options.filename, options.buffer);
  return ingestText({
    workspaceId: options.workspaceId,
    knowledgeBaseId: options.knowledgeBaseId,
    title: extracted.title ?? options.filename,
    text: extracted.text,
    meterToUserId: options.meterToUserId,
  });
}

export interface IngestUrlOptions {
  workspaceId: string;
  knowledgeBaseId: string;
  url: string;
  meterToUserId?: string;
}

/** Ingest a web page: fetch behind the SSRF guard, then share the text pipeline. */
export async function ingestUrl(options: IngestUrlOptions): Promise<IngestResult> {
  const { extractFromUrl } = await import("@/lib/knowledge/extract");
  const extracted = await extractFromUrl(options.url);
  return ingestText({
    workspaceId: options.workspaceId,
    knowledgeBaseId: options.knowledgeBaseId,
    title: extracted.title ?? options.url,
    text: extracted.text,
    meterToUserId: options.meterToUserId,
  });
}

/** How long to wait for the Atlas index to catch up before giving up on it. */
const SEARCHABLE_TIMEOUT_MS = 30_000;
const SEARCHABLE_POLL_MS = 1_000;

/**
 * Block until this document's chunks are visible to `$vectorSearch`.
 *
 * Atlas Search indexes update asynchronously, typically within a couple of
 * seconds. Returns `false` on timeout rather than throwing: the rows are
 * written and will become searchable shortly, so failing the whole ingest over
 * a slow index would be worse than a brief delay.
 */
async function waitUntilSearchable(documentId: string): Promise<boolean> {
  const deadline = Date.now() + SEARCHABLE_TIMEOUT_MS;

  // A zero vector is a legitimate query here: we do not care what ranks first,
  // only whether the index can see any chunk of this document at all.
  const probe = new Array(EMBEDDING_DIMENSIONS).fill(0);
  probe[0] = 1;

  while (Date.now() < deadline) {
    const hits = await Chunk.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector: probe,
          numCandidates: 100,
          limit: 1,
          filter: { documentId },
        },
      },
      { $limit: 1 },
      { $project: { _id: 1 } },
    ]);

    if (hits.length > 0) return true;
    await new Promise((r) => setTimeout(r, SEARCHABLE_POLL_MS));
  }

  return false;
}

/** Delete a document and everything indexed from it. */
export async function deleteDocument(workspaceId: string, documentId: string): Promise<boolean> {
  await connectToDatabase();
  const result = await KnowledgeDocument.deleteOne({ _id: documentId, workspaceId });
  if (result.deletedCount === 0) return false;

  // Chunks are deleted after the document, so a crash between the two leaves
  // orphaned chunks that retrieval will never return (it filters by ready
  // documents) rather than a searchable document with no record.
  await Chunk.deleteMany({ documentId });
  return true;
}

/** The default knowledge base for a workspace, created on first use. */
export async function getOrCreateDefaultKnowledgeBase(workspaceId: string): Promise<string> {
  await connectToDatabase();

  const existing = await KnowledgeBase.findOne({ workspaceId }).sort({ createdAt: 1 }).lean();
  if (existing) return existing._id;

  const created = await KnowledgeBase.create({
    workspaceId,
    name: "My documents",
    defaultVisibility: "workspace",
  });
  return created._id;
}
