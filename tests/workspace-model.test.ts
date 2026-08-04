import { describe, it, expect } from "vitest";
import { Workspace } from "@/lib/db/models/Workspace";

describe("Workspace model", () => {
  it("requires a name and an owner", () => {
    const err = new Workspace({}).validateSync();
    expect(err?.errors.name).toBeDefined();
    expect(err?.errors.ownerUserId).toBeDefined();
  });

  it("defaults personal to false and generates a string id", () => {
    const ws = new Workspace({ name: "Personal", ownerUserId: "user-1" });
    expect(ws.validateSync()).toBeUndefined();
    expect(typeof ws._id).toBe("string");
    expect(ws.personal).toBe(false);
  });
});
