import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient, type Collection } from "mongodb";
import { v4 as uuid } from "uuid";
import { chunkText } from "@/lib/knowledge/chunker";
import { OpenAIEmbeddingProvider } from "@/lib/knowledge/embeddings";

/**
 * The real retrieval path: real embeddings written to the real collection, then
 * queried through Atlas `$vectorSearch`.
 *
 * A mocked test cannot exercise this at all. The specific failure it exists to
 * catch is a dimension or filter-path mismatch between
 * `scripts/create-knowledge-indexes.mjs` and what the pipeline writes. That
 * mismatch throws nothing: the query succeeds and returns an empty array, so
 * every layer above reports success while retrieval quietly returns nothing.
 *
 * Everything is namespaced to a throwaway workspace id and deleted afterwards.
 */

const hasEnv = !!process.env.MONGODB_URI && !!process.env.OPENAI_API_KEY;
const live = hasEnv ? describe : describe.skip;

const VECTOR_INDEX = "knowledge_vector";

const HANDBOOK = `
# Refunds
A customer can request a refund within thirty days of purchase. Refunds are
returned to the original payment method and take five to seven working days.

# Shipping
Standard delivery is three to five working days. Express delivery arrives the
next working day if the order is placed before 2pm.

# Warranty
Every product carries a two year warranty against manufacturing defects. It does
not cover accidental damage, water damage, or normal wear.
`;

live("Atlas $vectorSearch, against the real cluster", () => {
  const workspaceId = `test-ws-${uuid()}`;
  const knowledgeBaseId = `test-kb-${uuid()}`;
  const documentId = `test-doc-${uuid()}`;
  const otherWorkspaceId = `test-ws-${uuid()}`;

  let client: MongoClient;
  let chunks: Collection;
  let headings: string[] = [];
  const provider = new OpenAIEmbeddingProvider();

  beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    chunks = client.db().collection("chunks");

    const indexes = (await chunks.listSearchIndexes().toArray()) as {
      name: string;
      queryable?: boolean;
    }[];
    const vector = indexes.find((i) => i.name === VECTOR_INDEX);
    if (!vector?.queryable) {
      throw new Error(
        `${VECTOR_INDEX} is not queryable. Run: node scripts/create-knowledge-indexes.mjs`
      );
    }

    const pieces = chunkText(HANDBOOK);
    headings = pieces.map((p) => p.heading ?? "-");
    const vectors = await provider.embed(pieces.map((p) => p.text));

    await chunks.insertMany(
      pieces.map((piece, i) => ({
        _id: uuid(),
        workspaceId,
        knowledgeBaseId,
        documentId,
        ord: piece.ord,
        text: piece.text,
        heading: piece.heading,
        embedding: vectors[i],
        tokens: piece.tokens,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as never
    );

    // One chunk in a workspace the querying user has no business seeing.
    const [leak] = await provider.embed(["Refund policy for the other company"]);
    await chunks.insertOne({
      _id: uuid(),
      workspaceId: otherWorkspaceId,
      knowledgeBaseId: "other-kb",
      documentId: "other-doc",
      ord: 0,
      text: "Refund policy for the other company",
      embedding: leak,
      tokens: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    // The index is eventually consistent; give it a moment to pick the rows up.
    for (let i = 0; i < 30; i++) {
      const hits = await search("refund", { workspaceId });
      if (hits.length) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, 180_000);

  afterAll(async () => {
    if (!chunks) return;
    await chunks.deleteMany({ workspaceId: { $in: [workspaceId, otherWorkspaceId] } });
    await client.close();
  });

  async function search(
    query: string,
    filter: Record<string, unknown>,
    limit = 3
  ): Promise<{ heading?: string; text: string; score: number; workspaceId: string }[]> {
    const [queryVector] = await provider.embed([query]);
    return chunks
      .aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "embedding",
            queryVector,
            numCandidates: 50,
            limit,
            filter,
          },
        },
        {
          $project: {
            _id: 0,
            heading: 1,
            text: 1,
            workspaceId: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray() as never;
  }

  it("indexed every chunk of the document", () => {
    expect(headings).toEqual(expect.arrayContaining(["Refunds", "Shipping", "Warranty"]));
  });

  it("finds the section that answers a question phrased in different words", async () => {
    const hits = await search("I want my money back on something I bought last week", {
      workspaceId,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].heading).toBe("Refunds");
    expect(hits[0].score).toBeGreaterThan(0);
  }, 60_000);

  it("answers a delivery question with the shipping section", async () => {
    const hits = await search("Can I get it tomorrow if I order this morning?", { workspaceId });
    expect(hits[0].heading).toBe("Shipping");
  }, 60_000);

  it("answers a damage question with the warranty section", async () => {
    const hits = await search("The screen cracked on its own after a year", { workspaceId });
    expect(hits[0].heading).toBe("Warranty");
  }, 60_000);

  it("never returns a chunk from another workspace", async () => {
    // "refund" matches content in both workspaces, so this only passes if the
    // filter is genuinely applied inside the search rather than after it.
    const hits = await search("refund policy", { workspaceId }, 10);

    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.workspaceId).toBe(workspaceId);
    }
  }, 60_000);

  it("returns nothing for a workspace with no documents", async () => {
    const hits = await search("refund policy", { workspaceId: `test-ws-${uuid()}` });
    expect(hits).toEqual([]);
  }, 60_000);

  it("can be narrowed to a single document", async () => {
    const hits = await search("refund", { workspaceId, documentId }, 10);
    expect(hits.length).toBeGreaterThan(0);

    const none = await search("refund", { workspaceId, documentId: "does-not-exist" }, 10);
    expect(none).toEqual([]);
  }, 60_000);
});

if (!hasEnv) {
  describe("Atlas $vectorSearch", () => {
    it.skip("skipped: MONGODB_URI or OPENAI_API_KEY is not set", () => {});
  });
}
