import { describe, it, expect } from "vitest";
import { Membership } from "@/lib/db/models/Membership";

describe("Membership model", () => {
  it("requires workspaceId, userId and a role", () => {
    const err = new Membership({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.userId).toBeDefined();
    expect(err?.errors.role).toBeDefined();
  });

  it("rejects a role outside the allowed set", () => {
    const err = new Membership({ workspaceId: "w1", userId: "u1", role: "superuser" }).validateSync();
    expect(err?.errors.role).toBeDefined();
  });

  it("accepts a valid role", () => {
    const err = new Membership({ workspaceId: "w1", userId: "u1", role: "owner" }).validateSync();
    expect(err).toBeUndefined();
  });
});
