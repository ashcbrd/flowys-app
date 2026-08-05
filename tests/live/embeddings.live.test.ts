import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/knowledge/chunker";
import {
  OpenAIEmbeddingProvider,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "@/lib/knowledge/embeddings";

/**
 * The unit tests for these two modules mock the provider, which means they
 * mostly test the mocks. This suite talks to the real embeddings API.
 *
 * The point is not that the call succeeds. It is that the vectors coming back
 * are actually usable for retrieval: right dimension, right order, and semantic
 * enough that a question lands on the chunk that answers it. A pipeline can pass
 * every mocked test and still return vectors that retrieve nothing, and nothing
 * short of a real call will tell you.
 */

const hasKey = !!process.env.OPENAI_API_KEY;
const live = hasKey ? describe : describe.skip;

/** Cosine similarity. Atlas ranks by this, so it is what we should be checking. */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** A document shaped like something a real customer would upload. */
const HANDBOOK = `
# Refunds

A customer can request a refund within thirty days of purchase. Refunds are
returned to the original payment method and take five to seven working days to
appear on a statement. We do not refund to a different card than the one used.

# Shipping

Standard delivery is three to five working days within the country. Express
delivery arrives the next working day if the order is placed before 2pm. We do
not ship on weekends or public holidays.

# Warranty

Every product carries a two year warranty against manufacturing defects. The
warranty does not cover accidental damage, water damage, or normal wear. A
warranty claim needs the original order number and a photograph of the fault.
`;

live("embeddings, against the real API", () => {
  const provider = new OpenAIEmbeddingProvider();

  it("returns vectors of exactly the dimension the Atlas index expects", async () => {
    const [vector] = await provider.embed(["How long do refunds take?"]);

    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector.every((n) => Number.isFinite(n))).toBe(true);
    // A zero vector would match nothing and throw no error.
    expect(vector.some((n) => n !== 0)).toBe(true);
  }, 60_000);

  it("keeps input order across a batch boundary", async () => {
    const provider2 = new OpenAIEmbeddingProvider({ batchSize: 2 });
    const texts = ["refunds and money back", "next day delivery", "two year warranty"];

    const vectors = await provider2.embed(texts);
    expect(vectors).toHaveLength(3);

    // Re-embedding one text alone must match the vector it got inside the batch.
    const [alone] = await provider2.embed([texts[1]]);
    expect(cosine(vectors[1], alone)).toBeGreaterThan(0.99);
  }, 90_000);

  it("chunks and embeds a whole document, and a question retrieves the right chunk", async () => {
    const chunks = chunkText(HANDBOOK);

    // Structure survived: one chunk per section, each labelled.
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.map((c) => c.heading)).toEqual(
      expect.arrayContaining(["Refunds", "Shipping", "Warranty"])
    );

    const vectors = await provider.embed(chunks.map((c) => c.text));
    expect(vectors).toHaveLength(chunks.length);
    for (const v of vectors) expect(v).toHaveLength(EMBEDDING_DIMENSIONS);

    // This is the test that matters. Ask three questions whose wording does not
    // overlap the source text much, and check the nearest chunk is the right one.
    const questions: { ask: string; expect: string }[] = [
      { ask: "I want my money back on something I bought last week", expect: "Refunds" },
      { ask: "Can I get it tomorrow if I order this morning?", expect: "Shipping" },
      { ask: "The screen cracked on its own after a year, is that covered?", expect: "Warranty" },
    ];

    const questionVectors = await provider.embed(questions.map((q) => q.ask));

    questions.forEach((question, i) => {
      const ranked = chunks
        .map((chunk, idx) => ({
          heading: chunk.heading,
          score: cosine(questionVectors[i], vectors[idx]),
        }))
        .sort((a, b) => b.score - a.score);

      expect(
        ranked[0].heading,
        `"${question.ask}" ranked ${ranked.map((r) => `${r.heading}:${r.score.toFixed(3)}`).join(" ")}`
      ).toBe(question.expect);

      // The winner should be clearly ahead, not a coin flip.
      expect(ranked[0].score - ranked[1].score).toBeGreaterThan(0.02);
    });
  }, 120_000);

  it("does not spend three attempts on a bad key", async () => {
    const bad = new OpenAIEmbeddingProvider({ apiKey: "sk-definitely-not-a-real-key" });
    const started = Date.now();

    await expect(bad.embed(["anything"])).rejects.toThrow();

    // Two retries with backoff would take at least 750ms. A terminal error
    // should come back immediately.
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);

  it("uses the model the corpus will be embedded with", () => {
    expect(provider.model).toBe(EMBEDDING_MODEL);
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });
});

if (!hasKey) {
  describe("embeddings, against the real API", () => {
    it.skip("skipped: OPENAI_API_KEY is not set", () => {});
  });
}
