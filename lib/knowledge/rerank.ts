/**
 * Reordering retrieved passages by how well they answer the question.
 *
 * Hybrid search is good at finding passages about the right subject and
 * indifferent to whether they contain the answer. Asking "how long is
 * parental leave" over an HR handbook surfaces every passage that discusses
 * leave; the one stating the number may rank third. The model reading the
 * context notices, but a top-3 cut may already have dropped it.
 *
 * The spec left the choice between Cohere and an LLM open. This uses the
 * provider already configured, because a reranker is not worth a second vendor
 * account, a second API key and a second thing that can be down.
 *
 * Degrading is the design, not an afterthought: if the reranker errors, times
 * out, or answers with nonsense, the original fusion order is returned. A
 * search that is merely unreranked is a far better outcome than a search that
 * fails.
 */
import { executePrompt } from "@/lib/providers";
import { FIXED_PROVIDER, FIXED_MODEL } from "@/lib/providers/models";
import type { RetrievedChunk } from "@/lib/knowledge/retrieval";

/** Passages beyond this are not worth the tokens to rerank. */
const MAX_CANDIDATES = 12;

export interface Reranker {
  rerank(query: string, chunks: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]>;
}

/**
 * Parse the model's ordering into indices we can trust.
 *
 * Everything is validated rather than assumed: entries must be integers, in
 * range, and unique. A hallucinated index would otherwise duplicate one
 * passage and silently drop another.
 */
export function parseRankedOrder(raw: unknown, candidateCount: number): number[] | null {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { order?: unknown })?.order)
      ? (raw as { order: unknown[] }).order
      : null;

  if (!list) return null;

  const seen = new Set<number>();
  const out: number[] = [];

  for (const entry of list) {
    const n = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isInteger(n) || n < 1 || n > candidateCount) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n - 1);
  }

  return out.length > 0 ? out : null;
}

export class LLMReranker implements Reranker {
  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number
  ): Promise<RetrievedChunk[]> {
    // Only a single passage has nothing to reorder. Note the guard is not
    // `chunks.length <= topK`: even when reranking cannot change which
    // passages survive, it changes which one is first, and the first is what
    // the answering model reads first and cites as [1].
    if (chunks.length <= 1) return chunks.slice(0, topK);

    const candidates = chunks.slice(0, MAX_CANDIDATES);

    try {
      const numbered = candidates
        .map((chunk, i) => {
          const where = chunk.heading ? `${chunk.documentTitle} > ${chunk.heading}` : chunk.documentTitle;
          // Truncated: a reranker judges relevance from the opening, and full
          // passages would multiply the cost of every search.
          const body = chunk.text.length > 500 ? `${chunk.text.slice(0, 500)}...` : chunk.text;
          return `[${i + 1}] ${where}\n${body}`;
        })
        .join("\n\n");

      const response = await executePrompt(
        FIXED_PROVIDER,
        { model: FIXED_MODEL, temperature: 0 },
        [
          {
            role: "system",
            content: [
              "You order passages by how directly they answer a question.",
              "A passage that states the answer outranks one that merely discusses the topic.",
              'Reply with JSON only, as {"order": [numbers]}, best first.',
              "Use only the numbers given, each at most once. Omit passages that do not help.",
            ].join(" "),
          },
          { role: "user", content: `Question: ${query}\n\nPassages:\n\n${numbered}` },
        ]
      );

      const order = parseRankedOrder(response, candidates.length);
      if (!order) return chunks.slice(0, topK);

      const reordered = order.map((i) => candidates[i]);

      // Anything the reranker omitted keeps its original relative order behind
      // the ranked results, so a passage it ignored is demoted, never lost.
      const used = new Set(order);
      const remainder = candidates.filter((_, i) => !used.has(i));

      return [...reordered, ...remainder, ...chunks.slice(MAX_CANDIDATES)].slice(0, topK);
    } catch {
      // Unreranked results beat no results.
      return chunks.slice(0, topK);
    }
  }
}

let cached: Reranker | null = null;

export function getReranker(): Reranker {
  if (!cached) cached = new LLMReranker();
  return cached;
}

/** Test seam. */
export function setReranker(reranker: Reranker | null): void {
  cached = reranker;
}
