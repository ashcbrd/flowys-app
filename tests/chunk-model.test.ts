import { describe, it, expect } from "vitest";
import { Chunk } from "@/lib/db/models/Chunk";

describe("Chunk model", () => {
  it("requires workspaceId, documentId, ord and text", () => {
    const err = new Chunk({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.documentId).toBeDefined();
    expect(err?.errors.ord).toBeDefined();
    expect(err?.errors.text).toBeDefined();
  });

  it("accepts an embedding vector and defaults tokens to 0", () => {
    const chunk = new Chunk({
      workspaceId: "w1",
      knowledgeBaseId: "kb1",
      documentId: "d1",
      ord: 0,
      text: "hello world",
      embedding: [0.1, 0.2, 0.3],
    });
    expect(chunk.validateSync()).toBeUndefined();
    expect(chunk.embedding).toHaveLength(3);
    expect(chunk.tokens).toBe(0);
  });
});
