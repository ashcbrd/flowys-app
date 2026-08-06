import { describe, it, expect } from "vitest";
import {
  chunkText,
  estimateTokens,
  DEFAULT_CHUNK_TOKENS,
} from "@/lib/knowledge/chunker";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("estimateTokens", () => {
  it("counts nothing for empty input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("   ")).toBe(1); // whitespace still costs a token
  });

  it("never under-counts, because a rejected embedding costs more than a small chunk", () => {
    // Whitespace-heavy text has more words than length/4 would suggest.
    const spaced = "a a a a a a a a a a";
    expect(estimateTokens(spaced)).toBeGreaterThanOrEqual(10);
  });
});

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  \n")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const chunks = chunkText("One short paragraph about invoices.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("One short paragraph about invoices.");
    expect(chunks[0].ord).toBe(0);
  });

  it("carries the heading a chunk lived under", () => {
    const doc = ["# Billing", "", "Invoices go out on the first.", "", "## Refunds", "", "Refunds take seven days."].join("\n");
    const chunks = chunkText(doc);
    expect(chunks.map((c) => c.heading)).toEqual(["Billing", "Refunds"]);
  });

  it("never lets one chunk span two headings", () => {
    const doc = ["# A", "", "alpha text", "", "# B", "", "beta text"].join("\n");
    const chunks = chunkText(doc, { maxTokens: 500 });
    for (const chunk of chunks) {
      expect(chunk.text.includes("alpha") && chunk.text.includes("beta")).toBe(false);
    }
  });

  it("respects the token budget", () => {
    const doc = Array.from({ length: 12 }, (_, i) => `${words(60)} para${i}.`).join("\n\n");
    const chunks = chunkText(doc, { maxTokens: 200, overlapRatio: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(200);
    }
  });

  it("splits a paragraph that is on its own over budget", () => {
    const chunks = chunkText(words(2000), { maxTokens: 100, overlapRatio: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(100);
    }
  });

  it("prefers to break on sentence boundaries", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something.`).join(" ");
    const chunks = chunkText(sentences, { maxTokens: 60, overlapRatio: 0 });
    // Every chunk should end on terminal punctuation, not mid-sentence.
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.text.trim().endsWith(".")).toBe(true);
    }
  });

  it("overlaps consecutive chunks so an idea on the seam is retrievable from either side", () => {
    const doc = Array.from({ length: 10 }, (_, i) => `${words(50)} marker${i}.`).join("\n\n");
    const chunks = chunkText(doc, { maxTokens: 200, overlapRatio: 0.25 });
    expect(chunks.length).toBeGreaterThan(1);

    const tailWords = chunks[0].text.split(/\s+/).slice(-5).join(" ");
    expect(chunks[1].text).toContain(tailWords);
  });

  it("emits no overlap when the ratio is zero", () => {
    const doc = Array.from({ length: 8 }, (_, i) => `${words(50)} marker${i}.`).join("\n\n");
    const chunks = chunkText(doc, { maxTokens: 200, overlapRatio: 0 });
    const first = chunks[0].text.split(/\s+/).slice(-4).join(" ");
    expect(chunks[1]?.text.startsWith(first)).toBe(false);
  });

  it("numbers chunks contiguously from zero across headings", () => {
    const doc = ["# A", "", words(300), "", "# B", "", words(300)].join("\n");
    const chunks = chunkText(doc, { maxTokens: 100 });
    expect(chunks.map((c) => c.ord)).toEqual(chunks.map((_, i) => i));
  });

  it("never emits an empty or whitespace-only chunk", () => {
    const doc = ["# A", "", "", "   ", "", "text", "", "# B", "", "   "].join("\n");
    for (const chunk of chunkText(doc)) {
      expect(chunk.text.trim()).not.toBe("");
    }
  });

  it("does not repeat the tail as a chunk of its own", () => {
    const doc = Array.from({ length: 6 }, (_, i) => `${words(50)} m${i}.`).join("\n\n");
    const chunks = chunkText(doc, { maxTokens: 200, overlapRatio: 0.2 });
    const texts = chunks.map((c) => c.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("rejects nonsense options rather than producing silent garbage", () => {
    expect(() => chunkText("x", { maxTokens: 0 })).toThrow(/maxTokens/);
    expect(() => chunkText("x", { overlapRatio: 1 })).toThrow(/overlapRatio/);
    expect(() => chunkText("x", { overlapRatio: -0.1 })).toThrow(/overlapRatio/);
  });

  it("defaults to the documented budget", () => {
    const doc = words(5000);
    for (const chunk of chunkText(doc)) {
      expect(chunk.tokens).toBeLessThanOrEqual(DEFAULT_CHUNK_TOKENS);
    }
  });
});
