import { describe, it, expect } from "vitest";
import { AppRun } from "@/lib/db/models/AppRun";

describe("AppRun model", () => {
  it("requires appListingId, workspaceId, runByUserId and startedAt", () => {
    const err = new AppRun({}).validateSync();
    expect(err?.errors.appListingId).toBeDefined();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.runByUserId).toBeDefined();
    expect(err?.errors.startedAt).toBeDefined();
  });

  it("defaults status to running and rejects an invalid status", () => {
    const ok = new AppRun({
      appListingId: "a1", workspaceId: "w1", runByUserId: "u1", startedAt: new Date(),
    });
    expect(ok.validateSync()).toBeUndefined();
    expect(ok.status).toBe("running");

    const bad = new AppRun({
      appListingId: "a1", workspaceId: "w1", runByUserId: "u1", startedAt: new Date(), status: "done",
    });
    expect(bad.validateSync()?.errors.status).toBeDefined();
  });
});
