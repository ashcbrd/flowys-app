# Internal AI Apps — Run Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a permitted member run a published app — gate access, enforce per-app rate limits + cost caps, execute the frozen snapshot, and record an audit-grade `AppRun`.

**Architecture:** A new `AppRun` model (audit record) and a `lib/apps/run.ts` service. `runApp` composes the access gate (`getAppForUser`), the current snapshot (`getCurrentSnapshot`), the existing rate-limit and credit machinery, and the workflow executor. Runs use the publisher's connections structurally — the snapshot already embeds the publisher's `connectionId`s, which the integration node resolves by id — so no engine change is needed.

**Tech Stack:** TypeScript, Mongoose 8 + Atlas, the existing `createExecutor` engine, `checkRateLimit`, `calculateWorkflowCost`/`deductCredits`, Vitest (unit + live).

## Global Constraints

- **Base:** this stacks on `feature/internal-apps-foundation` (uses `AppListing`, `AppVersion`, `getAppForUser`, `getCurrentSnapshot`). Branch off it.
- **Model `_id`** is a string uuid (`_id: { type: String, default: () => uuid() }`, `_id: false`); guard `mongoose.models.X || mongoose.model<IX>(...)`; model file imports only mongoose + uuid.
- **Two suites:** model validation unit-tested via `validateSync()`; the run service is DB/engine-backed → live-tested. Live tests clean up their throwaway data in `afterAll`.
- **Plain language in every user-facing string** — the `AppRunError` messages a person may see must contain no JSON, schema words, or model jargon.
- **Commits:** plain sentences; **never** a `Co-Authored-By: Claude` trailer or Claude Code URL.

---

### Task 1: AppRun model

**Files:**
- Create: `lib/db/models/AppRun.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/app-run-model.test.ts`

**Interfaces:**
- Produces: `AppRun` (model), `IAppRun` `{ _id: string; appListingId: string; appVersionId?: string; workspaceId: string; runByUserId: string; input?: Record<string, unknown>; output?: Record<string, unknown>; status: "running" | "completed" | "failed"; logs?: unknown[]; error?: string; cost?: number; durationMs?: number; startedAt: Date; completedAt?: Date; createdAt: Date; updatedAt: Date }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app-run-model.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app-run-model.test.ts`
Expected: FAIL — cannot find module `@/lib/db/models/AppRun`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/AppRun.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IAppRun {
  _id: string;
  appListingId: string;
  appVersionId?: string;
  workspaceId: string;
  runByUserId: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  logs?: unknown[];
  error?: string;
  cost?: number;
  durationMs?: number;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AppRunSchema = new Schema<IAppRun>(
  {
    _id: { type: String, default: () => uuid() },
    appListingId: { type: String, required: true, index: true },
    appVersionId: { type: String },
    workspaceId: { type: String, required: true, index: true },
    runByUserId: { type: String, required: true, index: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true,
    },
    logs: { type: Schema.Types.Mixed },
    error: { type: String },
    cost: { type: Number },
    durationMs: { type: Number },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true, _id: false }
);

export const AppRun: Model<IAppRun> =
  mongoose.models.AppRun || mongoose.model<IAppRun>("AppRun", AppRunSchema);
```

Add to `lib/db/index.ts`:

```ts
export { AppRun, type IAppRun } from "./models/AppRun";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app-run-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/AppRun.ts lib/db/index.ts tests/app-run-model.test.ts
git commit -m "Add the app run record for run history and audit"
```

---

### Task 2: runApp service (gate → limits → execute → record)

**Files:**
- Create: `lib/apps/run.ts`
- Test: `tests/live/app-run.live.test.ts`

**Interfaces:**
- Consumes: `getAppForUser`, `getCurrentSnapshot` (from `./service`), `createExecutor` (from `@/lib/engine`), `calculateWorkflowCost`/`deductCredits` (from `@/lib/credits`), `checkRateLimit` (from `@/lib/db/models/RateLimit`), `AppRun` (Task 1).
- Produces:
  - `class AppRunError extends Error` with `code: "not_found" | "not_published" | "rate_limited" | "cost_exceeded"`.
  - `interface RunAppResult { appRunId: string; success: boolean; output?: Record<string, unknown>; error?: string; cost: number }`
  - `async runApp(params: { appListingId: string; runByUserId: string; input: Record<string, unknown> }): Promise<RunAppResult>`

- [ ] **Step 1: Write the failing live test**

```ts
// tests/live/app-run.live.test.ts
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
```

- [ ] **Step 2: Run the live test to verify it fails**

Run: `npx vitest run --config vitest.live.config.ts tests/live/app-run.live.test.ts`
Expected: FAIL — cannot find module `@/lib/apps/run`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/apps/run.ts
import { v4 as uuid } from "uuid";
import { connectToDatabase } from "@/lib/db";
import type { NodeData, EdgeData } from "@/lib/db";
import { AppRun } from "@/lib/db/models/AppRun";
import { getAppForUser, getCurrentSnapshot } from "./service";
import { createExecutor } from "@/lib/engine";
import { calculateWorkflowCost, deductCredits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/db/models/RateLimit";

export type AppRunErrorCode = "not_found" | "not_published" | "rate_limited" | "cost_exceeded";

export class AppRunError extends Error {
  code: AppRunErrorCode;
  constructor(message: string, code: AppRunErrorCode) {
    super(message);
    this.name = "AppRunError";
    this.code = code;
  }
}

export interface RunAppResult {
  appRunId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  cost: number;
}

/**
 * Run a published app for a permitted member: gate access, enforce the app's
 * rate limit and per-run cost cap, execute the frozen snapshot, and record an
 * AppRun. Errors a person may see are plain-language AppRunErrors.
 */
export async function runApp(params: {
  appListingId: string;
  runByUserId: string;
  input: Record<string, unknown>;
}): Promise<RunAppResult> {
  const { appListingId, runByUserId, input } = params;
  await connectToDatabase();

  const listing = await getAppForUser(appListingId, runByUserId);
  if (!listing) throw new AppRunError("This app isn't available to you.", "not_found");

  const snapshot = await getCurrentSnapshot(appListingId);
  if (!snapshot) throw new AppRunError("This app hasn't been published yet.", "not_published");

  const nodes = snapshot.nodes as NodeData[];
  const edges = snapshot.edges as EdgeData[];

  const perHour = listing.settings?.rateLimitPerHour;
  if (perHour && perHour > 0) {
    const rl = await checkRateLimit({
      key: `apprun:${appListingId}:${runByUserId}`,
      limit: perHour,
      windowSeconds: 3600,
    });
    if (!rl.allowed) {
      throw new AppRunError(
        "You've run this app too many times in the last hour. Please try again shortly.",
        "rate_limited"
      );
    }
  }

  const cost = calculateWorkflowCost(nodes);
  const cap = listing.settings?.costCapPerRun;
  if (typeof cap === "number" && cost > cap) {
    throw new AppRunError("This run is too large to allow. Please contact the app's owner.", "cost_exceeded");
  }

  const appRunId = uuid();
  const startedAt = new Date();
  await AppRun.create({
    _id: appRunId,
    appListingId,
    appVersionId: listing.currentVersionId,
    workspaceId: listing.workspaceId,
    runByUserId,
    input,
    status: "running",
    startedAt,
  });

  const result = await createExecutor(nodes, edges).execute(input);
  await deductCredits(runByUserId, cost);

  await AppRun.updateOne(
    { _id: appRunId },
    {
      $set: {
        status: result.success ? "completed" : "failed",
        output: result.output,
        logs: result.logs,
        error: result.error,
        cost,
        durationMs: result.duration,
        completedAt: new Date(),
      },
    }
  );

  return { appRunId, success: result.success, output: result.output, error: result.error, cost };
}
```

- [ ] **Step 4: Run the live test to verify it passes**

Run: `npx vitest run --config vitest.live.config.ts tests/live/app-run.live.test.ts`
Expected: PASS (2 tests). Requires real `MONGODB_URI` in `.env`.

- [ ] **Step 5: Verify the whole suite and typecheck**

Run: `npx tsc --noEmit` — no new errors.
Run: `npm test` — unit suite green.
Run: `npm run test:live` — the new app-run live tests green and the existing live suite unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/apps/run.ts tests/live/app-run.live.test.ts
git commit -m "Run published apps with limits, cost caps, and recorded runs"
```

---

## Self-Review

**Spec coverage (design §5 + §11 sub-project 2):**
- `AppRun` audit record → Task 1 ✓
- publisher-context execution → satisfied structurally (snapshot embeds the publisher's connectionIds; integration node resolves by id) — noted; no code needed ✓
- rate-limit + cost-cap gates → Task 2 ✓
- recorded run (AppRun finalized) → Task 2 ✓
- streaming/live-run view → deferred to sub-project 3 (app page) ✓

**Placeholder scan:** no TBD/TODO; every step has real code + command. ✓

**Type consistency:** `getAppForUser`/`getCurrentSnapshot` signatures from the foundation branch are consumed as defined; `IAppListing.settings`/`currentVersionId` used consistently; `AppRunError.code` union identical between definition and the test's `toMatchObject({ code: "cost_exceeded" })`. ✓

**Scope:** single subsystem (run + record). Produces working, testable software (a member can run a published app and it's recorded; an outsider is denied; the cost cap blocks). ✓
