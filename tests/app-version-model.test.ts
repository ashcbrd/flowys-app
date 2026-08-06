import { describe, it, expect } from "vitest";
import { AppVersion } from "@/lib/db/models/AppVersion";

describe("AppVersion model", () => {
  it("requires appListingId, workspaceId, version, snapshot and publishedByUserId", () => {
    const err = new AppVersion({}).validateSync();
    expect(err?.errors.appListingId).toBeDefined();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.version).toBeDefined();
    expect(err?.errors.snapshot).toBeDefined();
    expect(err?.errors.publishedByUserId).toBeDefined();
  });

  it("accepts a snapshot of nodes and edges", () => {
    const v = new AppVersion({
      appListingId: "a1", workspaceId: "w1", version: 1,
      snapshot: { nodes: [{ id: "n1" }], edges: [] },
      publishedByUserId: "u1",
    });
    expect(v.validateSync()).toBeUndefined();
    expect(v.version).toBe(1);
    expect((v.snapshot as { nodes: unknown[] }).nodes).toHaveLength(1);
  });
});
