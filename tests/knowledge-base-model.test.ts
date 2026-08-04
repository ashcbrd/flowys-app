import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "@/lib/db/models/KnowledgeBase";

describe("KnowledgeBase model", () => {
  it("requires a workspaceId and a name", () => {
    const err = new KnowledgeBase({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.name).toBeDefined();
  });

  it("defaults visibility to workspace", () => {
    const kb = new KnowledgeBase({ workspaceId: "w1", name: "Docs" });
    expect(kb.validateSync()).toBeUndefined();
    expect(kb.defaultVisibility).toBe("workspace");
  });
});
