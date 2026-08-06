import { describe, it, expect, vi } from "vitest";
import { parseRankedOrder } from "@/lib/knowledge/rerank";

/**
 * The reranker's job is to improve an order it is also allowed to fail at. Every
 * test here is about the failure side, because a reranker that throws, hangs or
 * hallucinates must leave the search working rather than take it down.
 */
describe("parseRankedOrder", () => {
  it("accepts a bare array and converts to zero-based indices", () => {
    expect(parseRankedOrder([2, 1, 3], 3)).toEqual([1, 0, 2]);
  });

  it("accepts the documented {order} wrapper", () => {
    expect(parseRankedOrder({ order: [3, 1] }, 3)).toEqual([2, 0]);
  });

  it("accepts numeric strings, which models return more often than they should", () => {
    expect(parseRankedOrder(["2", "1"], 2)).toEqual([1, 0]);
  });

  it("drops indices outside the candidate range instead of reading past the array", () => {
    expect(parseRankedOrder([1, 99, 0, -3, 2], 2)).toEqual([0, 1]);
  });

  it("drops duplicates, which would repeat one passage and lose another", () => {
    expect(parseRankedOrder([1, 1, 2, 2], 2)).toEqual([0, 1]);
  });

  it("rejects a non-integer rather than rounding it into a wrong passage", () => {
    expect(parseRankedOrder([1.5, 2], 2)).toEqual([1]);
  });

  it("returns null for shapes that carry no ordering, so the caller keeps its own", () => {
    expect(parseRankedOrder(null, 3)).toBeNull();
    expect(parseRankedOrder({}, 3)).toBeNull();
    expect(parseRankedOrder("first one", 3)).toBeNull();
    expect(parseRankedOrder([], 3)).toBeNull();
    expect(parseRankedOrder(["nonsense", 0], 3)).toBeNull();
  });
});

describe("LLMReranker", () => {
  const chunk = (n: number) => ({
    documentId: `d${n}`,
    documentTitle: `Doc ${n}`,
    knowledgeBaseId: "kb",
    ord: 0,
    text: `passage ${n}`,
    score: 1 / n,
  });

  it("returns the original order when the model fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers", () => ({
      executePrompt: vi.fn(async () => {
        throw new Error("provider down");
      }),
    }));
    const { LLMReranker } = await import("@/lib/knowledge/rerank");

    const input = [chunk(1), chunk(2), chunk(3), chunk(4)];
    const out = await new LLMReranker().rerank("q", input, 2);

    expect(out.map((c) => c.documentId)).toEqual(["d1", "d2"]);
  });

  it("returns the original order when the model answers with nonsense", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers", () => ({
      executePrompt: vi.fn(async () => ({ thoughts: "the third one seems best" })),
    }));
    const { LLMReranker } = await import("@/lib/knowledge/rerank");

    const out = await new LLMReranker().rerank("q", [chunk(1), chunk(2), chunk(3)], 2);
    expect(out.map((c) => c.documentId)).toEqual(["d1", "d2"]);
  });

  it("promotes the passage the model picked", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers", () => ({
      executePrompt: vi.fn(async () => ({ order: [3, 1] })),
    }));
    const { LLMReranker } = await import("@/lib/knowledge/rerank");

    const out = await new LLMReranker().rerank("q", [chunk(1), chunk(2), chunk(3)], 2);
    expect(out.map((c) => c.documentId)).toEqual(["d3", "d1"]);
  });

  it("demotes rather than loses a passage the model omitted", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers", () => ({
      executePrompt: vi.fn(async () => ({ order: [2] })),
    }));
    const { LLMReranker } = await import("@/lib/knowledge/rerank");

    const out = await new LLMReranker().rerank("q", [chunk(1), chunk(2), chunk(3)], 3);
    expect(out.map((c) => c.documentId)).toEqual(["d2", "d1", "d3"]);
  });

  it("does not call the model for a single passage", async () => {
    vi.resetModules();
    const executePrompt = vi.fn();
    vi.doMock("@/lib/providers", () => ({ executePrompt }));
    const { LLMReranker } = await import("@/lib/knowledge/rerank");

    await new LLMReranker().rerank("q", [chunk(1)], 3);
    expect(executePrompt).not.toHaveBeenCalled();
  });

  it("still reranks when the set cannot change, because order decides citation [1]", async () => {
    vi.resetModules();
    const executePrompt = vi.fn(async () => ({ order: [2, 1] }));
    vi.doMock("@/lib/providers", () => ({ executePrompt }));
    const { LLMReranker } = await import("@/lib/knowledge/rerank");

    const out = await new LLMReranker().rerank("q", [chunk(1), chunk(2)], 2);
    expect(executePrompt).toHaveBeenCalled();
    expect(out.map((c) => c.documentId)).toEqual(["d2", "d1"]);
  });
});
