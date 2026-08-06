/**
 * The one place a question turns into passages.
 *
 * Both surfaces that will search documents, the chat page and the retrieval
 * step in a workflow, go through here, so access rules cannot drift apart
 * between them.
 *
 * The security property that matters: the set of documents a user may see is
 * resolved first and pushed into `$vectorSearch` as a filter. Filtering the
 * results afterwards would look equivalent and is not. Ranking happens before
 * a post-filter runs, so asking for the top 5 and then dropping the two the
 * user cannot see returns 3, and the 6th and 7th best passages, which the user
 * was allowed to read, are never considered.
 */
import { connectToDatabase, Chunk, KnowledgeDocument } from "@/lib/db";
import { getWorkspaceRole } from "@/lib/workspaces/service";
import { resolveAllowedDocumentIds } from "@/lib/workspaces/permissions";
import { getEmbeddingProvider } from "@/lib/knowledge/embeddings";

/** Must match the index names created by scripts/create-knowledge-indexes.mjs. */
export const VECTOR_INDEX_NAME = "knowledge_vector";
export const TEXT_INDEX_NAME = "knowledge_text";

export const DEFAULT_TOP_K = 5;

/**
 * Reciprocal Rank Fusion constant. 60 is the value from the original RRF paper
 * and works well when neither ranker's raw scores are calibrated against the
 * other's, which is exactly the situation here: cosine similarity and BM25 are
 * not comparable numbers, but ranks are.
 */
const RRF_K = 60;

/**
 * How many vectors Atlas scans before ranking. The docs suggest 10 to 20 times
 * the limit; too low and recall suffers on a large corpus, too high and every
 * query pays for it.
 */
const CANDIDATE_MULTIPLIER = 20;

export interface RetrieveOptions {
  workspaceId: string;
  userId: string;
  query: string;
  knowledgeBaseId?: string;
  topK?: number;
  /**
   * Reorder results by how directly they answer the question. Costs one extra
   * model call, so it is opt-in: a workflow step running thousands of times a
   * month should be able to decline it.
   */
  rerank?: boolean;
}

export interface RetrievedChunk {
  documentId: string;
  documentTitle: string;
  knowledgeBaseId: string;
  ord: number;
  heading?: string;
  text: string;
  score: number;
}

/**
 * Passages from documents this user is allowed to read, best first.
 *
 * Returns an empty array rather than throwing when the user is not a member of
 * the workspace or can see nothing in it. A caller cannot tell "no matches"
 * from "not allowed", which is the correct amount of information to leak.
 */
export async function retrieve(options: RetrieveOptions): Promise<RetrievedChunk[]> {
  const { workspaceId, userId, query, knowledgeBaseId } = options;
  const topK = options.topK ?? DEFAULT_TOP_K;

  if (!query.trim()) return [];

  await connectToDatabase();

  const role = await getWorkspaceRole(workspaceId, userId);
  if (!role) return [];

  // Only documents that finished processing can be searched; a `pending` or
  // `failed` document has no chunks, and a `processing` one has some of them,
  // which would answer a question from half a source.
  const documents = await KnowledgeDocument.find({
    workspaceId,
    status: "ready",
    ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
  })
    .select({ _id: 1, acl: 1, title: 1, knowledgeBaseId: 1 })
    .lean();

  if (documents.length === 0) return [];

  const allowedIds = resolveAllowedDocumentIds(
    documents.map((doc) => ({ _id: doc._id, acl: doc.acl })),
    { userId, role }
  );
  if (allowedIds.length === 0) return [];

  const titles = new Map(documents.map((doc) => [doc._id, doc.title]));

  const [queryVector] = await getEmbeddingProvider().embed([query]);

  // Hybrid: semantic and keyword legs run together, then Reciprocal Rank
  // Fusion merges them by rank. Vector search alone misses exact terms, a
  // product code, an error string, a person's name, because those embed close
  // to nothing. Keyword search alone misses paraphrase. Each leg fetches more
  // than topK so fusion has real overlap to work with.
  const legDepth = Math.max(topK * 2, 10);

  const vectorLeg = Chunk.aggregate<RawHit>([
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: Math.max(topK * CANDIDATE_MULTIPLIER, 100),
        limit: legDepth,
        filter: {
          workspaceId,
          // The allow-list goes inside the search, not after it.
          documentId: { $in: allowedIds },
        },
      },
    },
    { $project: RAW_HIT_PROJECTION },
  ]);

  // The text leg is optional by design: Atlas free tiers cap search indexes,
  // and production may only have the vector index. A missing index fails the
  // aggregation, and that failure downgrades the search instead of breaking it.
  const textLeg = Chunk.aggregate<RawHit>([
    {
      $search: {
        index: TEXT_INDEX_NAME,
        compound: {
          must: [{ text: { query, path: "text" } }],
          filter: [
            { equals: { path: "workspaceId", value: workspaceId } },
            { in: { path: "documentId", value: allowedIds } },
          ],
        },
      },
    },
    { $limit: legDepth },
    { $project: RAW_HIT_PROJECTION },
  ]).catch(() => [] as RawHit[]);

  const [vectorHits, textHits] = await Promise.all([vectorLeg, textLeg]);

  // Fuse deeper than topK when reranking, so the reranker has passages to
  // promote. Cutting to topK first would mean reranking a list that already
  // dropped the answer.
  const fused = fuseByReciprocalRank([vectorHits, textHits], options.rerank ? legDepth : topK);

  const hydrated = fused.map((hit) => ({
    documentId: hit.documentId,
    documentTitle: titles.get(hit.documentId) ?? "Untitled",
    knowledgeBaseId: hit.knowledgeBaseId,
    ord: hit.ord,
    heading: hit.heading,
    text: hit.text,
    score: hit.score,
  }));

  if (!options.rerank || hydrated.length <= 1) return hydrated.slice(0, topK);

  const { getReranker } = await import("@/lib/knowledge/rerank");
  return getReranker().rerank(query, hydrated, topK);
}

interface RawHit {
  documentId: string;
  knowledgeBaseId: string;
  ord: number;
  heading?: string;
  text: string;
}

const RAW_HIT_PROJECTION = {
  _id: 0,
  documentId: 1,
  knowledgeBaseId: 1,
  ord: 1,
  heading: 1,
  text: 1,
} as const;

/**
 * Merge ranked lists with Reciprocal Rank Fusion: each list contributes
 * 1 / (RRF_K + rank) for every item it ranked, and items sum across lists.
 *
 * Rank, not score, because cosine similarity and BM25 live on unrelated
 * scales; comparing them directly would let whichever leg produces larger
 * numbers win every argument. Exported for direct testing, since a subtle
 * fusion bug does not fail, it just quietly returns worse passages.
 */
export function fuseByReciprocalRank(lists: RawHit[][], topK: number): (RawHit & { score: number })[] {
  const byKey = new Map<string, RawHit & { score: number }>();

  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = `${hit.documentId}:${hit.ord}`;
      const entry = byKey.get(key);
      const contribution = 1 / (RRF_K + rank + 1);
      if (entry) {
        entry.score += contribution;
      } else {
        byKey.set(key, { ...hit, score: contribution });
      }
    });
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Render passages for a prompt, numbered so the model can cite them.
 *
 * The numbering is the citation contract: [1] in an answer means `chunks[0]`,
 * so the UI can link it back to a real document rather than hoping.
 */
export function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk, i) => {
      const where = chunk.heading ? `${chunk.documentTitle} > ${chunk.heading}` : chunk.documentTitle;
      return `[${i + 1}] ${where}\n${chunk.text}`;
    })
    .join("\n\n");
}
