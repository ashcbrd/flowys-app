import { describe, it, expect } from "vitest";
import { AppListing } from "@/lib/db/models/AppListing";

describe("AppListing model", () => {
  it("requires workspaceId, workflowId, ownerUserId, slug and title", () => {
    const err = new AppListing({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.workflowId).toBeDefined();
    expect(err?.errors.ownerUserId).toBeDefined();
    expect(err?.errors.slug).toBeDefined();
    expect(err?.errors.title).toBeDefined();
  });

  it("defaults status to draft and audience.mode to workspace", () => {
    const app = new AppListing({
      workspaceId: "w1", workflowId: "wf1", ownerUserId: "u1",
      slug: "triage", title: "Triage",
    });
    expect(app.validateSync()).toBeUndefined();
    expect(app.status).toBe("draft");
    expect(app.audience.mode).toBe("workspace");
    expect(app.visibleFields).toEqual([]);
  });

  it("rejects an invalid status and an invalid audience mode", () => {
    const bad = new AppListing({
      workspaceId: "w1", workflowId: "wf1", ownerUserId: "u1", slug: "s", title: "t",
      status: "live", audience: { mode: "everyone" },
    });
    const err = bad.validateSync();
    expect(err?.errors.status).toBeDefined();
    expect(err?.errors["audience.mode"]).toBeDefined();
  });
});
