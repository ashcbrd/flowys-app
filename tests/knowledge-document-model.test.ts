import { describe, it, expect } from "vitest";
import { KnowledgeDocument } from "@/lib/db/models/KnowledgeDocument";

describe("KnowledgeDocument model", () => {
  it("requires workspaceId, knowledgeBaseId, source and title", () => {
    const err = new KnowledgeDocument({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.knowledgeBaseId).toBeDefined();
    expect(err?.errors.title).toBeDefined();
    expect(err?.errors["source.type"]).toBeDefined();
  });

  it("defaults status to pending, chunkCount to 0 and acl.mode to workspace", () => {
    const doc = new KnowledgeDocument({
      workspaceId: "w1",
      knowledgeBaseId: "kb1",
      title: "Handbook",
      source: { type: "upload", ref: "blob://x" },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe("pending");
    expect(doc.chunkCount).toBe(0);
    expect(doc.acl.mode).toBe("workspace");
  });

  it("rejects an invalid status", () => {
    const doc = new KnowledgeDocument({
      workspaceId: "w1",
      knowledgeBaseId: "kb1",
      title: "x",
      source: { type: "upload", ref: "r" },
      status: "done",
    });
    expect(doc.validateSync()?.errors.status).toBeDefined();
  });
});
