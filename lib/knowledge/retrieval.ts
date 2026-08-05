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

/** Must match the index name created by scripts/create-knowledge-indexes.mjs. */
export const VECTOR_INDEX_NAME = "knowledge_vector";

export const DEFAULT_TOP_K = 5;

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

  const results = await Chunk.aggregate<{
    documentId: string;
    knowledgeBaseId: string;
    ord: number;
    heading?: string;
    text: string;
    score: number;
  }>([
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        numCandidates: Math.max(topK * CANDIDATE_MULTIPLIER, 100),
        limit: topK,
        filter: {
          workspaceId,
          // The allow-list goes inside the search, not after it.
          documentId: { $in: allowedIds },
        },
      },
    },
    {
      $project: {
        _id: 0,
        documentId: 1,
        knowledgeBaseId: 1,
        ord: 1,
        heading: 1,
        text: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  return results.map((hit) => ({
    documentId: hit.documentId,
    documentTitle: titles.get(hit.documentId) ?? "Untitled",
    knowledgeBaseId: hit.knowledgeBaseId,
    ord: hit.ord,
    heading: hit.heading,
    text: hit.text,
    score: hit.score,
  }));
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
