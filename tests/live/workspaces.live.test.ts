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
    // Matches TEST_USER itself and the "-concurrent" variant used below.
    const ownerFilter = { ownerUserId: { $regex: `^${TEST_USER}` } };
    const ws = await Workspace.find(ownerFilter);
    const ids = ws.map((w) => w._id);
    await Membership.deleteMany({ workspaceId: { $in: ids } });
    await Workspace.deleteMany(ownerFilter);
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

  it("stays race-safe under concurrent sign-ins for the same user", async () => {
    const CONCURRENT_USER = `${TEST_USER}-concurrent`;

    const [first, second] = await Promise.all([
      getOrCreatePersonalWorkspace(CONCURRENT_USER),
      getOrCreatePersonalWorkspace(CONCURRENT_USER),
    ]);
    expect(first).toBe(second);

    await connectToDatabase();
    const workspaceCount = await Workspace.countDocuments({
      ownerUserId: CONCURRENT_USER,
      personal: true,
    });
    expect(workspaceCount).toBe(1);

    const membershipCount = await Membership.countDocuments({
      workspaceId: first,
      userId: CONCURRENT_USER,
      role: "owner",
    });
    expect(membershipCount).toBe(1);
  });
});
