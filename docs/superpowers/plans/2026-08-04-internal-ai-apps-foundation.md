# Internal AI Apps — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backbone for publishing a workflow as an internal app — the `AppListing` and `AppVersion` models, a pure per-app access resolver, a DB-backed access gate, and the publish/version/rollback engine.

**Architecture:** Two new Mongoose models (`AppListing`, `AppVersion`) following the existing string-uuid pattern; a pure `lib/apps/access.ts` deciding who may open an app; and a DB-backed `lib/apps/service.ts` that freezes a workflow into an immutable versioned snapshot on publish, repoints the live app, rolls back, and gates access by workspace membership + audience. No UI, no run engine yet — this produces the data + logic the rest of the platform builds on.

**Tech Stack:** TypeScript, Next.js 16, Mongoose 8 + MongoDB Atlas, Vitest (unit + live), `uuid`.

## Global Constraints

- **Base branch:** this work stacks on `feature/rag-foundation` — it uses `Workspace`, `Membership`, `Role`, and `getWorkspaceRole` from `lib/workspaces/service.ts`, which exist only on that branch. Branch the implementation off `feature/rag-foundation`.
- **Model `_id` is a string uuid**, declared `_id: { type: String, default: () => uuid() }` with schema option `_id: false`, following `lib/db/models/Workspace.ts`.
- **Model registration guard:** `mongoose.models.X || mongoose.model<IX>("X", schema)`.
- **Model files import only `mongoose` + `uuid`** at runtime. A `import type { ... }` from another model (erased at compile) is allowed; never import `lib/db/connection.ts`.
- **Two test suites:** model *validation* is unit-tested with `new Model({...}).validateSync()` (no DB); DB *queries* (publish/rollback/access gate) are live-tested with `npm run test:live`.
- **No raw JSON, schema words, or model jargon in any user-facing string.** (No UI in this sub-project; keep it in mind for error messages.)
- **Commits:** plain-sentence messages describing the user-visible outcome. **Never add a `Co-Authored-By: Claude` trailer or a Claude Code URL.**
- **Reuse, don't duplicate:** the access resolver mirrors the shape of `lib/workspaces/permissions.ts` (pure, default-deny). Live tests must clean up their throwaway data (afterAll), mirroring `tests/live/workspaces.live.test.ts`.

---

### Task 1: AppListing model

**Files:**
- Create: `lib/db/models/AppListing.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/app-listing-model.test.ts`

**Interfaces:**
- Produces: `AppListing` (model) and types:
  - `type AppStatus = "draft" | "published" | "unpublished"`
  - `type AudienceMode = "workspace" | "roles" | "users"`
  - `interface IAppAudience { mode: AudienceMode; roles?: Role[]; userIds?: string[] }`
  - `interface IAppSettings { rateLimitPerHour?: number; costCapPerRun?: number; retentionDays?: number }`
  - `interface IAppListing { _id: string; workspaceId: string; workflowId: string; ownerUserId: string; slug: string; title: string; description?: string; icon?: string; color?: string; category?: string; visibleFields: string[]; audience: IAppAudience; currentVersionId?: string; status: AppStatus; settings: IAppSettings; createdAt: Date; updatedAt: Date }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/app-listing-model.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app-listing-model.test.ts`
Expected: FAIL — cannot find module `@/lib/db/models/AppListing`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/AppListing.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";
import type { Role } from "./Membership";

export type AppStatus = "draft" | "published" | "unpublished";
export type AudienceMode = "workspace" | "roles" | "users";

export interface IAppAudience {
  mode: AudienceMode;
  roles?: Role[];
  userIds?: string[];
}

export interface IAppSettings {
  rateLimitPerHour?: number;
  costCapPerRun?: number;
  retentionDays?: number;
}

export interface IAppListing {
  _id: string;
  workspaceId: string;
  workflowId: string;
  ownerUserId: string;
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  visibleFields: string[];
  audience: IAppAudience;
  currentVersionId?: string;
  status: AppStatus;
  settings: IAppSettings;
  createdAt: Date;
  updatedAt: Date;
}

const AppListingSchema = new Schema<IAppListing>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    icon: { type: String },
    color: { type: String },
    category: { type: String },
    visibleFields: { type: [String], default: [] },
    audience: {
      mode: { type: String, enum: ["workspace", "roles", "users"], default: "workspace" },
      roles: { type: [String], default: undefined },
      userIds: { type: [String], default: undefined },
    },
    currentVersionId: { type: String },
    status: {
      type: String,
      enum: ["draft", "published", "unpublished"],
      default: "draft",
      index: true,
    },
    settings: {
      rateLimitPerHour: { type: Number },
      costCapPerRun: { type: Number },
      retentionDays: { type: Number },
    },
  },
  { timestamps: true, _id: false }
);

// One slug per workspace.
AppListingSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });

export const AppListing: Model<IAppListing> =
  mongoose.models.AppListing || mongoose.model<IAppListing>("AppListing", AppListingSchema);
```

Add to `lib/db/index.ts`:

```ts
export {
  AppListing,
  type IAppListing,
  type IAppAudience,
  type IAppSettings,
  type AppStatus,
  type AudienceMode,
} from "./models/AppListing";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app-listing-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/AppListing.ts lib/db/index.ts tests/app-listing-model.test.ts
git commit -m "Add the app listing model for published workflows"
```

---

### Task 2: AppVersion model

**Files:**
- Create: `lib/db/models/AppVersion.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/app-version-model.test.ts`

**Interfaces:**
- Produces: `AppVersion` (model), `IAppVersion` `{ _id: string; appListingId: string; workspaceId: string; version: number; snapshot: { nodes: unknown[]; edges: unknown[] }; publishedByUserId: string; note?: string; createdAt: Date; updatedAt: Date }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app-version-model.test.ts
import { describe, it, expect } from "vitest";
import { AppVersion } from "@/lib/db/models/AppVersion";

describe("AppVersion model", () => {
  it("requires appListingId, workspaceId, version, snapshot and publishedByUserId", () => {
    const err = new AppVersion({}).validateSync();
    expect(err?.errors.appListingId).toBeDefined();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.version).toBeDefined();
    expect(err?.errors.snapshot).toBeDefined();
    expect(err?.errors.publishedByUserId).toBeDefined();
  });

  it("accepts a snapshot of nodes and edges", () => {
    const v = new AppVersion({
      appListingId: "a1", workspaceId: "w1", version: 1,
      snapshot: { nodes: [{ id: "n1" }], edges: [] },
      publishedByUserId: "u1",
    });
    expect(v.validateSync()).toBeUndefined();
    expect(v.version).toBe(1);
    expect((v.snapshot as { nodes: unknown[] }).nodes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app-version-model.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/AppVersion.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IAppVersion {
  _id: string;
  appListingId: string;
  workspaceId: string;
  version: number;
  snapshot: { nodes: unknown[]; edges: unknown[] };
  publishedByUserId: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppVersionSchema = new Schema<IAppVersion>(
  {
    _id: { type: String, default: () => uuid() },
    appListingId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    publishedByUserId: { type: String, required: true },
    note: { type: String },
  },
  { timestamps: true, _id: false }
);

// Versions are numbered per app.
AppVersionSchema.index({ appListingId: 1, version: 1 }, { unique: true });

export const AppVersion: Model<IAppVersion> =
  mongoose.models.AppVersion || mongoose.model<IAppVersion>("AppVersion", AppVersionSchema);
```

Add to `lib/db/index.ts`:

```ts
export { AppVersion, type IAppVersion } from "./models/AppVersion";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app-version-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/AppVersion.ts lib/db/index.ts tests/app-version-model.test.ts
git commit -m "Add the app version model for frozen snapshots"
```

---

### Task 3: Access resolver (pure, security-critical)

The single source of truth for "may this user open this app". Pure (no DB) so it can be exhaustively unit-tested. Default-deny; a non-member (null role) is denied outright.

**Files:**
- Create: `lib/apps/access.ts`
- Test: `tests/app-access-resolver.test.ts`

**Interfaces:**
- Consumes: `Role` (from `lib/db/models/Membership`), `IAppAudience` (from `lib/db/models/AppListing`).
- Produces:
  - `interface AppAccessContext { userId: string; role: Role | null }`
  - `function userCanAccessApp(audience: IAppAudience, ctx: AppAccessContext): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/app-access-resolver.test.ts
import { describe, it, expect } from "vitest";
import { userCanAccessApp } from "@/lib/apps/access";

const member = { userId: "u1", role: "member" as const };
const nonMember = { userId: "u1", role: null };

describe("userCanAccessApp", () => {
  it("denies a non-member (null role) for any audience", () => {
    expect(userCanAccessApp({ mode: "workspace" }, nonMember)).toBe(false);
    expect(userCanAccessApp({ mode: "roles", roles: ["member"] }, nonMember)).toBe(false);
    expect(userCanAccessApp({ mode: "users", userIds: ["u1"] }, nonMember)).toBe(false);
  });

  it("allows any member for workspace-mode", () => {
    expect(userCanAccessApp({ mode: "workspace" }, member)).toBe(true);
  });

  it("roles-mode: allows a matching role, denies otherwise", () => {
    expect(userCanAccessApp({ mode: "roles", roles: ["member", "admin"] }, member)).toBe(true);
    expect(userCanAccessApp({ mode: "roles", roles: ["admin"] }, member)).toBe(false);
    expect(userCanAccessApp({ mode: "roles" }, member)).toBe(false); // no list
  });

  it("users-mode: allows a listed user, denies otherwise", () => {
    expect(userCanAccessApp({ mode: "users", userIds: ["u1"] }, member)).toBe(true);
    expect(userCanAccessApp({ mode: "users", userIds: ["u2"] }, member)).toBe(false);
    expect(userCanAccessApp({ mode: "users" }, member)).toBe(false); // no list
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app-access-resolver.test.ts`
Expected: FAIL — cannot find module `@/lib/apps/access`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/apps/access.ts
import type { Role } from "@/lib/db/models/Membership";
import type { IAppAudience } from "@/lib/db/models/AppListing";

export interface AppAccessContext {
  userId: string;
  role: Role | null; // null means the user is not a member of the app's workspace
}

/**
 * Whether a user may open/run an app, given the app's audience and the user's
 * role in the app's workspace. Default-deny:
 * - a non-member (role null) is denied for every audience;
 * - "workspace" is visible to any member;
 * - "roles" requires the user's role to be listed;
 * - "users" requires the user's id to be listed.
 * Callers must pass the user's role IN THE APP'S WORKSPACE (null if not a member).
 */
export function userCanAccessApp(audience: IAppAudience, ctx: AppAccessContext): boolean {
  if (!ctx.role) return false;
  switch (audience.mode) {
    case "workspace":
      return true;
    case "roles":
      return audience.roles?.includes(ctx.role) ?? false;
    case "users":
      return audience.userIds?.includes(ctx.userId) ?? false;
    default:
      return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app-access-resolver.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/apps/access.ts tests/app-access-resolver.test.ts
git commit -m "Add the app access resolver"
```

---

### Task 4: Publish / version / rollback service (DB, live-tested)

Freezes a workflow into an immutable versioned snapshot on publish, repoints the live app, and rolls back. DB-backed, so verified on the live suite.

**Files:**
- Create: `lib/apps/service.ts`
- Test: `tests/live/apps-service.live.test.ts`

**Interfaces:**
- Consumes: `connectToDatabase`, `Workflow` (from `@/lib/db`), `AppListing` (Task 1), `AppVersion` (Task 2).
- Produces:
  - `async publishApp(appListingId: string, publishedByUserId: string): Promise<string>` — snapshots the workflow, creates the next `AppVersion`, points the listing at it, sets status `"published"`; returns the new version id. Idempotency is not required (each publish is a new version).
  - `async rollbackApp(appListingId: string, versionId: string): Promise<void>` — repoints `currentVersionId` to an existing prior version.
  - `async getCurrentSnapshot(appListingId: string): Promise<{ nodes: unknown[]; edges: unknown[] } | null>` — the live version's snapshot, or null if unpublished.

- [ ] **Step 1: Write the failing live test**

```ts
// tests/live/apps-service.live.test.ts
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
```

- [ ] **Step 2: Run the live test to verify it fails**

Run: `npx vitest run --config vitest.live.config.ts tests/live/apps-service.live.test.ts`
Expected: FAIL — cannot find module `@/lib/apps/service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/apps/service.ts
import { connectToDatabase, Workflow } from "@/lib/db";
import { AppListing } from "@/lib/db/models/AppListing";
import { AppVersion } from "@/lib/db/models/AppVersion";

/**
 * Freeze the app's workflow into a new immutable version and make it the live
 * one. Each call produces the next version number; publishing never mutates a
 * prior version.
 */
export async function publishApp(
  appListingId: string,
  publishedByUserId: string
): Promise<string> {
  await connectToDatabase();

  const listing = await AppListing.findById(appListingId);
  if (!listing) throw new Error("App not found");

  const workflow = await Workflow.findById(listing.workflowId).lean();
  if (!workflow) throw new Error("Workflow not found");

  const last = await AppVersion.findOne({ appListingId }).sort({ version: -1 }).lean();
  const version = (last?.version ?? 0) + 1;

  const created = await AppVersion.create({
    appListingId,
    workspaceId: listing.workspaceId,
    version,
    snapshot: { nodes: workflow.nodes, edges: workflow.edges },
    publishedByUserId,
  });

  listing.currentVersionId = created._id;
  listing.status = "published";
  await listing.save();

  return created._id;
}

/** Point the live app at an existing prior version. */
export async function rollbackApp(appListingId: string, versionId: string): Promise<void> {
  await connectToDatabase();
  const version = await AppVersion.findOne({ _id: versionId, appListingId }).lean();
  if (!version) throw new Error("Version not found");
  await AppListing.updateOne({ _id: appListingId }, { $set: { currentVersionId: versionId } });
}

/** The snapshot the app currently runs, or null if it has no live version. */
export async function getCurrentSnapshot(
  appListingId: string
): Promise<{ nodes: unknown[]; edges: unknown[] } | null> {
  await connectToDatabase();
  const listing = await AppListing.findById(appListingId).lean();
  if (!listing?.currentVersionId) return null;
  const version = await AppVersion.findById(listing.currentVersionId).lean();
  return (version?.snapshot as { nodes: unknown[]; edges: unknown[] }) ?? null;
}
```

- [ ] **Step 4: Run the live test to verify it passes**

Run: `npx vitest run --config vitest.live.config.ts tests/live/apps-service.live.test.ts`
Expected: PASS (1 test). Requires a real `MONGODB_URI` in `.env`.

- [ ] **Step 5: Commit**

```bash
git add lib/apps/service.ts tests/live/apps-service.live.test.ts
git commit -m "Publish workflows as versioned apps with rollback"
```

---

### Task 5: Access gate (DB, live-tested)

Combines the workspace role lookup with the pure resolver into the one function every app surface calls to load an app for a user.

**Files:**
- Modify: `lib/apps/service.ts` (add `getAppForUser`)
- Test: `tests/live/apps-access-gate.live.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceRole` (from `@/lib/workspaces/service`), `userCanAccessApp` (Task 3), `AppListing`, `IAppListing`.
- Produces: `async getAppForUser(appListingId: string, userId: string): Promise<IAppListing | null>` — returns the listing only if the user is a workspace member whose access the audience allows; otherwise `null`.

- [ ] **Step 1: Write the failing live test**

```ts
// tests/live/apps-access-gate.live.test.ts
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
```

- [ ] **Step 2: Run the live test to verify it fails**

Run: `npx vitest run --config vitest.live.config.ts tests/live/apps-access-gate.live.test.ts`
Expected: FAIL — `getAppForUser` is not exported from `@/lib/apps/service`.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/apps/service.ts`:

```ts
import { getWorkspaceRole } from "@/lib/workspaces/service";
import { userCanAccessApp } from "./access";
import type { IAppListing } from "@/lib/db/models/AppListing";

/**
 * Load an app for a user, enforcing workspace membership + the app's audience.
 * Returns null (not an error) when the user may not access it, so callers can
 * treat "no access" and "not found" identically — no existence leak.
 */
export async function getAppForUser(
  appListingId: string,
  userId: string
): Promise<IAppListing | null> {
  await connectToDatabase();
  const listing = await AppListing.findById(appListingId).lean<IAppListing>();
  if (!listing) return null;
  const role = await getWorkspaceRole(listing.workspaceId, userId);
  if (!userCanAccessApp(listing.audience, { userId, role })) return null;
  return listing;
}
```

- [ ] **Step 4: Run the live test to verify it passes**

Run: `npx vitest run --config vitest.live.config.ts tests/live/apps-access-gate.live.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Verify the whole suite and typecheck**

Run: `npx tsc --noEmit` — no new errors.
Run: `npm test` — all unit tests green (Tasks 1–3).
Run: `npm run test:live` — the two new app live tests green and the existing live suite unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/apps/service.ts tests/live/apps-access-gate.live.test.ts
git commit -m "Gate app access by workspace membership and audience"
```

---

## Self-Review

**Spec coverage (against §11 sub-project 1 of the design):**
- `AppListing` schema → Task 1 ✓
- `AppVersion` schema → Task 2 ✓
- pure `userCanAccessApp` (per-app RBAC, default-deny) → Task 3 ✓
- publish / snapshot / version / rollback engine → Task 4 ✓
- DB access gate (membership + audience) → Task 5 ✓
- `AppRun`, `AppFavorite`, `AuditEvent`, run engine, UI → later sub-projects, out of scope here. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has real code and a real command. ✓

**Type consistency:** `Role` defined in Membership (base branch), imported as a type by Task 1 and Task 3. `IAppAudience` defined in Task 1, consumed by Task 3. `IAppListing` from Task 1 used by Task 5's `getAppForUser` return type. `publishApp`/`rollbackApp`/`getCurrentSnapshot` signatures identical between Task 4's Step 3 and their test usage; `getAppForUser` identical between Task 5's interface and implementation. Model `_id`/guard/import conventions identical across Tasks 1–2. ✓

**Scope:** Single subsystem (app data model + access + publish engine). Produces working, independently testable software (models validate; resolver enforces; publish/rollback and the access gate work against a real DB). ✓
