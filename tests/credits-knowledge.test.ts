import { describe, it, expect } from "vitest";
import { calculateIndexingCost, RETRIEVAL_COST } from "@/lib/credits";

/**
 * Indexing was free and untracked, which made the one part of the product with
 * an unbounded per-request cost the one part with no record of its spend.
 */
describe("calculateIndexingCost", () => {
  it("costs nothing for a document that produced no chunks", () => {
    expect(calculateIndexingCost(0)).toBe(0);
    expect(calculateIndexingCost(-1)).toBe(0);
  });

  it("charges at least one credit for anything that was indexed", () => {
    expect(calculateIndexingCost(1)).toBe(1);
    expect(calculateIndexingCost(9)).toBe(1);
  });

  it("scales with chunks, so a policy manual is not billed like an FAQ", () => {
    expect(calculateIndexingCost(10)).toBe(1);
    expect(calculateIndexingCost(11)).toBe(2);
    expect(calculateIndexingCost(500)).toBe(50);
  });

  it("is monotonic, so a bigger document never costs less", () => {
    let previous = 0;
    for (let n = 0; n <= 200; n++) {
      const cost = calculateIndexingCost(n);
      expect(cost).toBeGreaterThanOrEqual(previous);
      previous = cost;
    }
  });

  it("prices a retrieval as cheap, because the answer is billed separately", () => {
    expect(RETRIEVAL_COST).toBe(1);
    expect(RETRIEVAL_COST).toBeLessThan(calculateIndexingCost(100));
  });
});
