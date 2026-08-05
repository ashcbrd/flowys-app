import { describe, it, expect, vi } from "vitest";
import {
  OpenAIEmbeddingProvider,
  isTerminalEmbeddingError,
  batched,
  EMBEDDING_DIMENSIONS,
} from "@/lib/knowledge/embeddings";

const vector = (n = EMBEDDING_DIMENSIONS, fill = 0.1) => Array.from({ length: n }, () => fill);

/** A stub matching the shape of `openai.embeddings`. */
function stubClient(
  impl: (args: { input: string[] }) => { data: { index: number; embedding: number[] }[] }
) {
  return { create: vi.fn(async (args: never) => impl(args as never)) };
}

describe("batched", () => {
  it("preserves order and splits evenly", () => {
    expect(batched([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("rejects a nonsense size", () => {
    expect(() => batched([1], 0)).toThrow(/greater than zero/);
  });
});

describe("isTerminalEmbeddingError", () => {
  it("treats auth, forbidden, rate limit and quota as terminal", () => {
    expect(isTerminalEmbeddingError({ status: 401 })).toBe(true);
    expect(isTerminalEmbeddingError({ status: 403 })).toBe(true);
    expect(isTerminalEmbeddingError({ status: 429 })).toBe(true);
    expect(isTerminalEmbeddingError(new Error("insufficient_quota"))).toBe(true);
    expect(isTerminalEmbeddingError(new Error("Invalid API key provided"))).toBe(true);
  });

  it("treats a server error as worth retrying", () => {
    expect(isTerminalEmbeddingError({ status: 500 })).toBe(false);
    expect(isTerminalEmbeddingError(new Error("socket hang up"))).toBe(false);
  });
});

describe("OpenAIEmbeddingProvider", () => {
  it("returns nothing for no input, without calling the API", () => {
    const client = stubClient(() => ({ data: [] }));
    const provider = new OpenAIEmbeddingProvider({ client });
    return provider.embed([]).then((out) => {
      expect(out).toEqual([]);
      expect(client.create).not.toHaveBeenCalled();
    });
  });

  it("refuses to embed an empty string", async () => {
    const provider = new OpenAIEmbeddingProvider({ client: stubClient(() => ({ data: [] })) });
    await expect(provider.embed(["ok", "   "])).rejects.toThrow(/empty string/);
  });

  it("batches large inputs and keeps global order", async () => {
    const client = stubClient(({ input }) => ({
      data: input.map((text, index) => ({ index, embedding: vector(EMBEDDING_DIMENSIONS, Number(text)) })),
    }));
    const provider = new OpenAIEmbeddingProvider({ client, batchSize: 2 });

    const out = await provider.embed(["1", "2", "3", "4", "5"]);

    expect(client.create).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(5);
    expect(out.map((v) => v[0])).toEqual([1, 2, 3, 4, 5]);
  });

  it("reorders by the index the API reports rather than trusting response order", async () => {
    const client = stubClient(({ input }) => ({
      data: input
        .map((text, index) => ({ index, embedding: vector(EMBEDDING_DIMENSIONS, Number(text)) }))
        .reverse(),
    }));
    const provider = new OpenAIEmbeddingProvider({ client });

    const out = await provider.embed(["1", "2", "3"]);
    expect(out.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it("fails loudly when the vector dimension does not match the Atlas index", async () => {
    const client = stubClient(({ input }) => ({
      data: input.map((_, index) => ({ index, embedding: vector(512) })),
    }));
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.embed(["a"])).rejects.toThrow(/dimension mismatch/);
  });

  it("fails when the API returns the wrong number of vectors", async () => {
    const client = stubClient(() => ({ data: [{ index: 0, embedding: vector() }] }));
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.embed(["a", "b"])).rejects.toThrow(/count mismatch/);
  });

  it("retries a transient failure", async () => {
    let calls = 0;
    const client = {
      create: vi.fn(async (args: never) => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("bad gateway"), { status: 502 });
        const { input } = args as unknown as { input: string[] };
        return { data: input.map((_, index) => ({ index, embedding: vector() })) };
      }),
    };
    const provider = new OpenAIEmbeddingProvider({ client });

    const out = await provider.embed(["a"]);
    expect(out).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("never spends a retry on a quota error", async () => {
    let calls = 0;
    const client = {
      create: vi.fn(async () => {
        calls++;
        throw Object.assign(new Error("You exceeded your current quota"), { status: 429 });
      }),
    };
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.embed(["a"])).rejects.toThrow(/quota/);
    expect(calls).toBe(1);
  });

  it("gives up after the retry budget and surfaces the last error", async () => {
    const client = {
      create: vi.fn(async () => {
        throw Object.assign(new Error("upstream timeout"), { status: 504 });
      }),
    };
    const provider = new OpenAIEmbeddingProvider({ client });

    await expect(provider.embed(["a"])).rejects.toThrow(/upstream timeout/);
    expect(client.create).toHaveBeenCalledTimes(3);
  });
});
