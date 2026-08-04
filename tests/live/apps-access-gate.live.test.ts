import { describe, it, expect, afterAll } from "vitest";
import { connectToDatabase, AppListing, Membership } from "@/lib/db";
import { getAppForUser } from "@/lib/apps/service";
import { v4 as uuid } from "uuid";

const WS = `live-test-${Date.now()}`;
const memberId = `member-${Date.now()}`;
const outsiderId = `outsider-${Date.now()}`;
const appId = uuid();

describe("getAppForUser (live)", () => {
  afterAll(async () => {
    await connectToDatabase();
    await AppListing.deleteMany({ _id: appId });
    await Membership.deleteMany({ workspaceId: WS });
  });

  it("returns the app for a member and null for an outsider", async () => {
    await connectToDatabase();
    await Membership.create({ workspaceId: WS, userId: memberId, role: "member" });
    await AppListing.create({
      _id: appId, workspaceId: WS, workflowId: uuid(), ownerUserId: memberId,
      slug: "a", title: "A", audience: { mode: "workspace" }, status: "published",
    });

    const asMember = await getAppForUser(appId, memberId);
    expect(asMember?._id).toBe(appId);

    const asOutsider = await getAppForUser(appId, outsiderId);
    expect(asOutsider).toBeNull();
  });
});
