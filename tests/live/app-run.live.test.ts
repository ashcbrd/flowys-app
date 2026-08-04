import { describe, it, expect, afterAll } from "vitest";
import { connectToDatabase, Workflow, AppListing, AppVersion, AppRun, Membership } from "@/lib/db";
import { publishApp } from "@/lib/apps/service";
import { runApp, AppRunError } from "@/lib/apps/run";
import { v4 as uuid } from "uuid";

const WS = `live-test-${Date.now()}`;
const member = `member-${Date.now()}`;
const outsider = `outsider-${Date.now()}`;
const wfId = uuid();
const appId = uuid();

describe("runApp (live)", () => {
  afterAll(async () => {
    await connectToDatabase();
    await AppRun.deleteMany({ appListingId: appId });
    await AppVersion.deleteMany({ appListingId: appId });
    await AppListing.deleteMany({ _id: appId });
    await Workflow.deleteMany({ _id: wfId });
    await Membership.deleteMany({ workspaceId: WS });
  });

  it("runs a published app for a member and records an AppRun; denies an outsider", async () => {
    await connectToDatabase();
    await Membership.create({ workspaceId: WS, userId: member, role: "member" });
    await Workflow.create({
      _id: wfId, userId: member, name: "WF",
      nodes: [
        { id: "in", type: "input", position: { x: 0, y: 0 }, data: { label: "In", config: { fields: [{ name: "name", type: "string" }] } } },
        { id: "out", type: "output", position: { x: 1, y: 0 }, data: { label: "Out", config: { format: "text", template: "Hello {{name}}" } } },
      ],
      edges: [{ id: "e1", source: "in", target: "out" }],
    });
    await AppListing.create({
      _id: appId, workspaceId: WS, workflowId: wfId, ownerUserId: member,
      slug: "greet", title: "Greeter", audience: { mode: "workspace" },
    });
    await publishApp(appId, member);

    const result = await runApp({ appListingId: appId, runByUserId: member, input: { name: "Ada" } });
    expect(result.success).toBe(true);
    expect(String((result.output as { result?: unknown })?.result)).toContain("Ada");

    const recorded = await AppRun.findById(result.appRunId).lean();
    expect(recorded?.status).toBe("completed");
    expect(recorded?.runByUserId).toBe(member);
    expect(recorded?.completedAt).not.toBeNull();
    expect(recorded?.completedAt).not.toBeUndefined();

    await expect(
      runApp({ appListingId: appId, runByUserId: outsider, input: { name: "Eve" } })
    ).rejects.toBeInstanceOf(AppRunError);
  });

  it("blocks a run over the per-run cost cap", async () => {
    await connectToDatabase();
    await AppListing.updateOne({ _id: appId }, { $set: { "settings.costCapPerRun": 0 } });
    // an input->output workflow costs 0; set the cap below any AI cost by using -1 is invalid,
    // so instead assert a normal run still succeeds at cap 0 for a 0-cost workflow, then raise cost.
    // Here we simply confirm the guard path is reachable: cap of 0 with a >0-cost node.
    await Workflow.updateOne({ _id: wfId }, { $set: { nodes: [
      { id: "in", type: "input", position: { x: 0, y: 0 }, data: { label: "In", config: { fields: [{ name: "name", type: "string" }] } } },
      { id: "logic", type: "logic", position: { x: 1, y: 0 }, data: { label: "Rule", config: { operation: "condition", condition: "1 == 1" } } },
    ] } });
    await publishApp(appId, member); // new version with a cost>0 node (logic costs 1)
    await expect(
      runApp({ appListingId: appId, runByUserId: member, input: { name: "Ada" } })
    ).rejects.toMatchObject({ code: "cost_exceeded" });
  });
});
