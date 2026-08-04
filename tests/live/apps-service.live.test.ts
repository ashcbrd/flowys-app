import { describe, it, expect, afterAll } from "vitest";
import { connectToDatabase, Workflow, AppListing, AppVersion } from "@/lib/db";
import { publishApp, rollbackApp, getCurrentSnapshot } from "@/lib/apps/service";
import { v4 as uuid } from "uuid";

const WS = `live-test-${Date.now()}`;
const wfId = uuid();
const appId = uuid();

describe("apps service (live)", () => {
  afterAll(async () => {
    await connectToDatabase();
    await AppVersion.deleteMany({ appListingId: appId });
    await AppListing.deleteMany({ _id: appId });
    await Workflow.deleteMany({ _id: wfId });
  });

  it("publishes a frozen version, bumps the number, and rolls back", async () => {
    await connectToDatabase();
    await Workflow.create({
      _id: wfId, userId: WS, name: "WF",
      nodes: [{ id: "n1", type: "input", position: { x: 0, y: 0 }, data: { label: "In", config: {} } }],
      edges: [],
    });
    await AppListing.create({
      _id: appId, workspaceId: WS, workflowId: wfId, ownerUserId: WS,
      slug: "app", title: "App",
    });

    const v1 = await publishApp(appId, WS);
    // change the workflow, publish again -> version 2
    await Workflow.updateOne({ _id: wfId }, { $set: { nodes: [
      { id: "n1", type: "input", position: { x: 0, y: 0 }, data: { label: "In", config: {} } },
      { id: "n2", type: "output", position: { x: 1, y: 0 }, data: { label: "Out", config: {} } },
    ] } });
    const v2 = await publishApp(appId, WS);

    const versions = await AppVersion.find({ appListingId: appId }).sort({ version: 1 }).lean();
    expect(versions.map((v) => v.version)).toEqual([1, 2]);

    const current = await getCurrentSnapshot(appId);
    expect(current?.nodes).toHaveLength(2); // live app on v2

    await rollbackApp(appId, v1);
    const afterRollback = await getCurrentSnapshot(appId);
    expect(afterRollback?.nodes).toHaveLength(1); // back to v1
    expect(v1).not.toBe(v2);
  });
});
