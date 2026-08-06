/**
 * The background half of ingestion.
 *
 * Indexing used to run inside the HTTP request that uploaded the document.
 * That works for a pasted FAQ and fails for the documents people actually
 * have: a two hundred page policy manual is hundreds of embedding calls, and
 * the request hits the platform's function timeout long before they finish.
 * The user sees a network error and the document is stranded half-indexed.
 *
 * So uploading now only stores the text and returns. This module does the work
 * afterwards, driven by the same cron endpoint the scheduler already uses.
 *
 * The state machine is `pending -> processing -> ready | failed`, and the
 * claim is a single atomic findOneAndUpdate. Two workers ticking at once
 * cannot both take the same document, because only one update matches a row
 * still in `pending`.
 */
import { connectToDatabase, KnowledgeDocument, Chunk } from "@/lib/db";
import { chunkText } from "@/lib/knowledge/chunker";
import { getEmbeddingProvider } from "@/lib/knowledge/embeddings";
import { deductCredits, calculateIndexingCost } from "@/lib/credits";
import { waitUntilSearchable } from "@/lib/knowledge/ingest";

/**
 * How long a claim is trusted before another worker may take the document.
 *
 * Long enough that a genuinely slow document is not stolen mid-flight, short
 * enough that a worker killed by a deploy does not strand its document until
 * someone notices. Serverless functions are killed without warning, so this is
 * the only thing standing between a crash and a document stuck in `processing`
 * forever.
 */
export const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

/** Attempts before a document is failed for good rather than retried forever. */
export const MAX_ATTEMPTS = 3;

/** Documents handled per tick. Bounded so one tick cannot run past its own timeout. */
const BATCH_SIZE = 3;

export interface ProcessResult {
  claimed: number;
  ready: number;
  failed: number;
  errors: string[];
}

/**
 * Claim one document atomically.
 *
 * Takes anything still `pending`, or anything stuck in `processing` past the
 * claim timeout, which is how a worker that died mid-document is recovered.
 */
async function claimNext() {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);

  return KnowledgeDocument.findOneAndUpdate(
    {
      $or: [
        { status: "pending" },
        { status: "processing", claimedAt: { $lt: staleBefore } },
      ],
    },
    { $set: { status: "processing", claimedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true }
  );
}

/**
 * Index one already-claimed document.
 *
 * Exported so a request can process its own document immediately when it is
 * small, giving the common case its old synchronous feel without the timeout
 * risk on the uncommon one.
 */
export async function indexDocument(documentId: string): Promise<"ready" | "failed"> {
  await connectToDatabase();

  const document = await KnowledgeDocument.findById(documentId);
  if (!document) return "failed";

  const text = document.pendingText ?? "";

  try {
    const pieces = chunkText(text);
    if (pieces.length === 0) {
      await fail(documentId, "No readable text found in this document");
      return "failed";
    }

    const vectors = await getEmbeddingProvider().embed(pieces.map((p) => p.text));

    // Replace, never append: a re-index that keeps the old chunks answers from
    // both versions at once, and the stale half often scores higher because it
    // is longer.
    await Chunk.deleteMany({ documentId });
    await Chunk.insertMany(
      pieces.map((piece, i) => ({
        workspaceId: document.workspaceId,
        knowledgeBaseId: document.knowledgeBaseId,
        documentId,
        ord: piece.ord,
        text: piece.text,
        heading: piece.heading,
        embedding: vectors[i],
        tokens: piece.tokens,
      }))
    );

    // Written is not searchable. The Atlas index is eventually consistent, so
    // a document marked ready the instant its rows land answers "I could not
    // find anything about that" to the first question asked of it. The inline
    // path already waited; the worker has to as well, or a queued document is
    // ready-but-unfindable for its first few seconds.
    await waitUntilSearchable(documentId);

    await KnowledgeDocument.updateOne(
      { _id: documentId },
      {
        status: "ready",
        chunkCount: pieces.length,
        // The chunks are the searchable copy; keeping the source too would
        // double storage for no benefit.
        $unset: { error: "", claimedAt: "", pendingText: "" },
      }
    );

    if (document.meteredToUserId) {
      await deductCredits(document.meteredToUserId, calculateIndexingCost(pieces.length));
    }

    return "ready";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed";

    // Below the attempt ceiling, hand it back to `pending` so the next tick
    // retries it. A transient provider blip should not permanently fail a
    // document the user can see sitting there.
    if ((document.attempts ?? 0) < MAX_ATTEMPTS) {
      await Chunk.deleteMany({ documentId });
      await KnowledgeDocument.updateOne(
        { _id: documentId },
        { status: "pending", error: message, $unset: { claimedAt: "" } }
      );
      return "failed";
    }

    await fail(documentId, message);
    return "failed";
  }
}

async function fail(documentId: string, message: string): Promise<void> {
  // Leave nothing half-indexed behind a failure; retrieval only reads `ready`
  // documents, but orphaned chunks would still occupy the index.
  await Chunk.deleteMany({ documentId });
  await KnowledgeDocument.updateOne(
    { _id: documentId },
    { status: "failed", error: message, chunkCount: 0, $unset: { claimedAt: "", pendingText: "" } }
  );
}

/**
 * One tick: claim and index up to BATCH_SIZE documents.
 *
 * Never throws. A tick that fails loudly would take the cron endpoint down
 * with it and stop every other document being processed.
 */
export async function processPendingDocuments(): Promise<ProcessResult> {
  await connectToDatabase();

  const result: ProcessResult = { claimed: 0, ready: 0, failed: 0, errors: [] };

  for (let i = 0; i < BATCH_SIZE; i++) {
    const claimed = await claimNext();
    if (!claimed) break;

    result.claimed++;
    try {
      const outcome = await indexDocument(claimed._id);
      if (outcome === "ready") result.ready++;
      else result.failed++;
    } catch (error) {
      result.failed++;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}
