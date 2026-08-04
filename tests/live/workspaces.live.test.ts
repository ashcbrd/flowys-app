import { describe, it, expect, afterAll } from "vitest";
import { connectToDatabase, Workspace, Membership } from "@/lib/db";
import {
  getOrCreatePersonalWorkspace,
  getWorkspaceRole,
} from "@/lib/workspaces/service";

const TEST_USER = `live-test-${Date.now()}`;

describe("workspace service (live)", () => {
  afterAll(async () => {
    await connectToDatabase();
    const ws = await Workspace.find({ ownerUserId: TEST_USER });
    const ids = ws.map((w) => w._id);
    await Membership.deleteMany({ workspaceId: { $in: ids } });
    await Workspace.deleteMany({ ownerUserId: TEST_USER });
  });

  it("creates a personal workspace with an owner membership, idempotently", async () => {
    const first = await getOrCreatePersonalWorkspace(TEST_USER);
    const second = await getOrCreatePersonalWorkspace(TEST_USER);
    expect(first).toBe(second); // idempotent — no duplicate workspace

    const role = await getWorkspaceRole(first, TEST_USER);
    expect(role).toBe("owner");

    await connectToDatabase();
    const count = await Workspace.countDocuments({ ownerUserId: TEST_USER, personal: true });
    expect(count).toBe(1);
  });
});
