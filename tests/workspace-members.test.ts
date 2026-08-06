import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The rules that keep a workspace administrable.
 *
 * Four roles were modelled and only "owner" was ever written, so every rule
 * below was theoretical until this file. The two that matter most are the ones
 * with no recovery path if they are wrong: an admin must not be able to demote
 * or remove an owner, and the last owner must not be removable, because a
 * workspace with no owner cannot be fixed from inside the product.
 */

const state: {
  memberships: { workspaceId: string; userId: string; role: string; createdAt: Date }[];
  users: { _id: string; email: string; name?: string }[];
} = { memberships: [], users: [] };

vi.mock("@/lib/db", () => ({
  connectToDatabase: vi.fn(async () => {}),
  User: {
    findOne: (q: { email: string }) => ({
      lean: async () => state.users.find((u) => u.email === q.email) ?? null,
    }),
    find: () => ({ select: () => ({ lean: async () => state.users }) }),
  },
}));

vi.mock("@/lib/db/models/Membership", () => ({
  Membership: {
    findOne: (q: { workspaceId: string; userId: string }) => ({
      lean: async () =>
        state.memberships.find((m) => m.workspaceId === q.workspaceId && m.userId === q.userId) ?? null,
    }),
    find: (q: { workspaceId?: string; userId?: string }) => ({
      sort: () => ({
        lean: async () =>
          state.memberships.filter((m) =>
            q.workspaceId ? m.workspaceId === q.workspaceId : m.userId === q.userId
          ),
      }),
      lean: async () =>
        state.memberships.filter((m) =>
          q.workspaceId ? m.workspaceId === q.workspaceId : m.userId === q.userId
        ),
    }),
    countDocuments: async (q: { workspaceId: string; role: string }) =>
      state.memberships.filter((m) => m.workspaceId === q.workspaceId && m.role === q.role).length,
    create: async (doc: { workspaceId: string; userId: string; role: string }) => {
      state.memberships.push({ ...doc, createdAt: new Date() });
      return doc;
    },
    updateOne: async (q: { workspaceId: string; userId: string }, update: { role: string }) => {
      const m = state.memberships.find(
        (x) => x.workspaceId === q.workspaceId && x.userId === q.userId
      );
      if (m) m.role = update.role;
    },
    deleteOne: async (q: { workspaceId: string; userId: string }) => {
      state.memberships = state.memberships.filter(
        (m) => !(m.workspaceId === q.workspaceId && m.userId === q.userId)
      );
    },
  },
}));

vi.mock("@/lib/db/models/Workspace", () => ({
  Workspace: {
    create: async (doc: Record<string, unknown>) => ({ ...doc, _id: "ws-new" }),
    find: () => ({ lean: async () => [] }),
  },
}));

const { addMember, changeRole, removeMember, listMembers, MemberError } = await import(
  "@/lib/workspaces/members"
);

const WS = "ws-1";

beforeEach(() => {
  state.memberships = [
    { workspaceId: WS, userId: "owner-1", role: "owner", createdAt: new Date() },
    { workspaceId: WS, userId: "admin-1", role: "admin", createdAt: new Date() },
    { workspaceId: WS, userId: "member-1", role: "member", createdAt: new Date() },
  ];
  state.users = [
    { _id: "owner-1", email: "owner@example.com" },
    { _id: "admin-1", email: "admin@example.com" },
    { _id: "member-1", email: "member@example.com" },
    { _id: "outsider-1", email: "new@example.com", name: "New Person" },
  ];
});

describe("who may manage the member list", () => {
  it("lets an owner add someone", async () => {
    const row = await addMember(WS, "owner-1", "new@example.com", "member");
    expect(row.userId).toBe("outsider-1");
    expect(state.memberships).toHaveLength(4);
  });

  it("lets an admin add someone", async () => {
    await addMember(WS, "admin-1", "new@example.com", "viewer");
    expect(state.memberships).toHaveLength(4);
  });

  it("refuses a plain member", async () => {
    await expect(addMember(WS, "member-1", "new@example.com", "member")).rejects.toThrow(
      /owners and admins/
    );
  });

  it("refuses a stranger to the workspace", async () => {
    await expect(addMember(WS, "nobody", "new@example.com", "member")).rejects.toThrow(
      /not a member/
    );
  });
});

describe("adding", () => {
  it("says plainly when the person has no account rather than creating a dead row", async () => {
    await expect(addMember(WS, "owner-1", "ghost@example.com", "member")).rejects.toThrow(
      /has a Flowys account yet/
    );
  });

  it("refuses a duplicate", async () => {
    await expect(addMember(WS, "owner-1", "member@example.com", "member")).rejects.toThrow(
      /already in this workspace/
    );
  });

  it("refuses to assign ownership directly", async () => {
    await expect(
      addMember(WS, "owner-1", "new@example.com", "owner" as never)
    ).rejects.toThrow(/transferred, not assigned/);
  });

  it("carries a real status code for the API to use", async () => {
    await expect(addMember(WS, "member-1", "new@example.com", "member")).rejects.toMatchObject({
      status: 403,
    });
    await expect(addMember(WS, "owner-1", "ghost@example.com", "member")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("the rules with no recovery path", () => {
  it("stops an admin demoting an owner", async () => {
    await expect(changeRole(WS, "admin-1", "owner-1", "member")).rejects.toThrow(
      /Only an owner can change an owner/
    );
  });

  it("stops an admin removing an owner", async () => {
    await expect(removeMember(WS, "admin-1", "owner-1")).rejects.toThrow(
      /Only an owner can remove an owner/
    );
  });

  it("stops the last owner being removed, which would strand the workspace", async () => {
    await expect(removeMember(WS, "owner-1", "owner-1")).rejects.toThrow(/last owner/);
    expect(state.memberships.some((m) => m.role === "owner")).toBe(true);
  });

  it("stops the last owner demoting themselves", async () => {
    await expect(changeRole(WS, "owner-1", "owner-1", "admin")).rejects.toThrow(/last owner/);
  });

  it("allows an owner to step down once there are two", async () => {
    state.memberships.push({ workspaceId: WS, userId: "owner-2", role: "owner", createdAt: new Date() });
    await changeRole(WS, "owner-1", "owner-1", "admin");
    expect(state.memberships.find((m) => m.userId === "owner-1")!.role).toBe("admin");
  });
});

describe("ordinary changes", () => {
  it("promotes a member to admin", async () => {
    await changeRole(WS, "owner-1", "member-1", "admin");
    expect(state.memberships.find((m) => m.userId === "member-1")!.role).toBe("admin");
  });

  it("removes a member", async () => {
    await removeMember(WS, "admin-1", "member-1");
    expect(state.memberships.map((m) => m.userId)).not.toContain("member-1");
  });

  it("refuses to change someone who is not in the workspace", async () => {
    await expect(changeRole(WS, "owner-1", "outsider-1", "member")).rejects.toThrow(
      /not in this workspace/
    );
  });

  it("lists everyone with their identity resolved", async () => {
    const rows = await listMembers(WS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ userId: "owner-1", email: "owner@example.com", role: "owner" });
  });

  it("names a deleted account rather than showing a bare id", async () => {
    state.memberships.push({ workspaceId: WS, userId: "gone", role: "member", createdAt: new Date() });
    const rows = await listMembers(WS);
    expect(rows.find((r) => r.userId === "gone")!.email).toBe("(deleted account)");
  });
});

describe("MemberError", () => {
  it("is an Error, so an unhandled one still behaves", () => {
    expect(new MemberError("x", 400)).toBeInstanceOf(Error);
  });
});
