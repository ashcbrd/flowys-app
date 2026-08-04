# Enterprise RAG Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data-model backbone and permission core for enterprise RAG — workspaces, membership/roles, knowledge bases, documents with per-document ACLs, chunks, and a server-side permission resolver — so every later sub-project can scope and secure knowledge by workspace and document.

**Architecture:** Five new Mongoose models in `lib/db/models/` (string-uuid `_id`, following the existing `User`/`UserCredits` pattern), a pure permission resolver in `lib/workspaces/permissions.ts` that decides which documents a user may see, and a DB-backed workspace service that seeds a personal workspace for each user on sign-in. No UI and no retrieval yet — this sub-project produces the schemas + permission logic the rest of Phase 1 depends on.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Mongoose 8 + MongoDB Atlas, NextAuth v5, Vitest (unit + live suites), `uuid`.

## Global Constraints

- **Model `_id` is a string uuid**, declared `_id: { type: String, default: () => uuid() }` with schema option `_id: false`, following `lib/db/models/User.ts`.
- **Model registration guard:** `mongoose.models.X || mongoose.model<IX>("X", schema)` — required so Next.js hot-reload does not re-register.
- **Two test suites:** `npm test` (mocked env, fast, proves logic) and `npm run test:live` (real `.env`, real Atlas). Any schema-shape or DB-query change must be proven on the live suite, not the unit suite alone. Model *validation* can be unit-tested with `new Model({...}).validateSync()` (synchronous, no DB connection needed). DB *queries* must be live-tested.
- **`lib/db/connection.ts` throws at import time without `MONGODB_URI`.** Model files must import only `mongoose` + `uuid` (never `connection.ts`), so unit tests can import them safely.
- **No raw JSON, schema words, or developer jargon in any user-facing string.** This sub-project has no UI; role labels stay internal until the UI sub-projects add them to `lib/vocabulary.ts`.
- **Dev server is port 3001**, not 3000.
- **Commits:** plain-sentence messages describing the user-visible outcome (see `git log`). **Never add a `Co-Authored-By: Claude` trailer or a Claude Code URL** (standing user instruction).
- **Reuse existing isolation helpers**; do not duplicate `getUserWorkflowIds`/`userOwnsWorkflow` patterns — mirror them.

---

### Task 1: Workspace model

**Files:**
- Create: `lib/db/models/Workspace.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/workspace-model.test.ts`

**Interfaces:**
- Produces: `Workspace` (Mongoose model), `IWorkspace` type `{ _id: string; name: string; ownerUserId: string; personal: boolean; createdAt: Date; updatedAt: Date }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/workspace-model.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workspace-model.test.ts`
Expected: FAIL — cannot find module `@/lib/db/models/Workspace`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/Workspace.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IWorkspace {
  _id: string;
  name: string;
  ownerUserId: string;
  personal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: String, required: true, index: true },
    personal: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false }
);

export const Workspace: Model<IWorkspace> =
  mongoose.models.Workspace || mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);
```

Then add to `lib/db/index.ts` (after the `User` export block):

```ts
export { Workspace, type IWorkspace } from "./models/Workspace";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workspace-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/Workspace.ts lib/db/index.ts tests/workspace-model.test.ts
git commit -m "Add the workspace model for knowledge bases"
```

---

### Task 2: Membership model (roles)

**Files:**
- Create: `lib/db/models/Membership.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/membership-model.test.ts`

**Interfaces:**
- Produces: `Membership` (model), `IMembership` `{ _id: string; workspaceId: string; userId: string; role: Role; createdAt: Date; updatedAt: Date }`, and `type Role = "owner" | "admin" | "member" | "viewer"`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/membership-model.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/membership-model.test.ts`
Expected: FAIL — cannot find module `@/lib/db/models/Membership`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/Membership.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface IMembership {
  _id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      required: true,
    },
  },
  { timestamps: true, _id: false }
);

// A user has exactly one role per workspace.
MembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const Membership: Model<IMembership> =
  mongoose.models.Membership || mongoose.model<IMembership>("Membership", MembershipSchema);
```

Add to `lib/db/index.ts`:

```ts
export { Membership, type IMembership, type Role } from "./models/Membership";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/membership-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/Membership.ts lib/db/index.ts tests/membership-model.test.ts
git commit -m "Add workspace membership and roles"
```

---

### Task 3: KnowledgeBase model

**Files:**
- Create: `lib/db/models/KnowledgeBase.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/knowledge-base-model.test.ts`

**Interfaces:**
- Produces: `KnowledgeBase` (model), `IKnowledgeBase` `{ _id: string; workspaceId: string; name: string; description?: string; defaultVisibility: "workspace" | "restricted"; createdAt: Date; updatedAt: Date }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/knowledge-base-model.test.ts
import { describe, it, expect } from "vitest";
import { KnowledgeBase } from "@/lib/db/models/KnowledgeBase";

describe("KnowledgeBase model", () => {
  it("requires a workspaceId and a name", () => {
    const err = new KnowledgeBase({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.name).toBeDefined();
  });

  it("defaults visibility to workspace", () => {
    const kb = new KnowledgeBase({ workspaceId: "w1", name: "Docs" });
    expect(kb.validateSync()).toBeUndefined();
    expect(kb.defaultVisibility).toBe("workspace");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/knowledge-base-model.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/KnowledgeBase.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IKnowledgeBase {
  _id: string;
  workspaceId: string;
  name: string;
  description?: string;
  defaultVisibility: "workspace" | "restricted";
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseSchema = new Schema<IKnowledgeBase>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    defaultVisibility: {
      type: String,
      enum: ["workspace", "restricted"],
      default: "workspace",
    },
  },
  { timestamps: true, _id: false }
);

export const KnowledgeBase: Model<IKnowledgeBase> =
  mongoose.models.KnowledgeBase ||
  mongoose.model<IKnowledgeBase>("KnowledgeBase", KnowledgeBaseSchema);
```

Add to `lib/db/index.ts`:

```ts
export { KnowledgeBase, type IKnowledgeBase } from "./models/KnowledgeBase";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/knowledge-base-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/KnowledgeBase.ts lib/db/index.ts tests/knowledge-base-model.test.ts
git commit -m "Add the knowledge base model"
```

---

### Task 4: KnowledgeDocument model (with per-document ACL)

**Note:** the model is named `KnowledgeDocument` (not `Document`) to avoid shadowing the global DOM `Document` type in TypeScript. Its Mongoose model name is `"KnowledgeDocument"` (collection `knowledgedocuments`).

**Files:**
- Create: `lib/db/models/KnowledgeDocument.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/knowledge-document-model.test.ts`

**Interfaces:**
- Produces: `KnowledgeDocument` (model) and types:
  - `type DocumentStatus = "pending" | "processing" | "ready" | "failed"`
  - `interface IDocumentAcl { mode: "workspace" | "restricted"; allowedUserIds?: string[]; allowedRoles?: string[] }`
  - `interface IKnowledgeDocument { _id: string; workspaceId: string; knowledgeBaseId: string; source: { type: "upload" | "url" | "connector"; ref: string }; title: string; status: DocumentStatus; error?: string; acl: IDocumentAcl; checksum?: string; chunkCount: number; createdAt: Date; updatedAt: Date }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/knowledge-document-model.test.ts
import { describe, it, expect } from "vitest";
import { KnowledgeDocument } from "@/lib/db/models/KnowledgeDocument";

describe("KnowledgeDocument model", () => {
  it("requires workspaceId, knowledgeBaseId, source and title", () => {
    const err = new KnowledgeDocument({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.knowledgeBaseId).toBeDefined();
    expect(err?.errors.title).toBeDefined();
    expect(err?.errors["source.type"]).toBeDefined();
  });

  it("defaults status to pending, chunkCount to 0 and acl.mode to workspace", () => {
    const doc = new KnowledgeDocument({
      workspaceId: "w1",
      knowledgeBaseId: "kb1",
      title: "Handbook",
      source: { type: "upload", ref: "blob://x" },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.status).toBe("pending");
    expect(doc.chunkCount).toBe(0);
    expect(doc.acl.mode).toBe("workspace");
  });

  it("rejects an invalid status", () => {
    const doc = new KnowledgeDocument({
      workspaceId: "w1",
      knowledgeBaseId: "kb1",
      title: "x",
      source: { type: "upload", ref: "r" },
      status: "done",
    });
    expect(doc.validateSync()?.errors.status).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/knowledge-document-model.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/KnowledgeDocument.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface IDocumentAcl {
  mode: "workspace" | "restricted";
  allowedUserIds?: string[];
  allowedRoles?: string[];
}

export interface IKnowledgeDocument {
  _id: string;
  workspaceId: string;
  knowledgeBaseId: string;
  source: { type: "upload" | "url" | "connector"; ref: string };
  title: string;
  status: DocumentStatus;
  error?: string;
  acl: IDocumentAcl;
  checksum?: string;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeDocumentSchema = new Schema<IKnowledgeDocument>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    knowledgeBaseId: { type: String, required: true, index: true },
    source: {
      type: { type: String, enum: ["upload", "url", "connector"], required: true },
      ref: { type: String, required: true },
    },
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String },
    acl: {
      mode: { type: String, enum: ["workspace", "restricted"], default: "workspace" },
      allowedUserIds: { type: [String], default: undefined },
      allowedRoles: { type: [String], default: undefined },
    },
    checksum: { type: String },
    chunkCount: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
);

export const KnowledgeDocument: Model<IKnowledgeDocument> =
  mongoose.models.KnowledgeDocument ||
  mongoose.model<IKnowledgeDocument>("KnowledgeDocument", KnowledgeDocumentSchema);
```

Add to `lib/db/index.ts`:

```ts
export {
  KnowledgeDocument,
  type IKnowledgeDocument,
  type IDocumentAcl,
  type DocumentStatus,
} from "./models/KnowledgeDocument";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/knowledge-document-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/KnowledgeDocument.ts lib/db/index.ts tests/knowledge-document-model.test.ts
git commit -m "Add the document model with per-document access rules"
```

---

### Task 5: Chunk model

**Files:**
- Create: `lib/db/models/Chunk.ts`
- Modify: `lib/db/index.ts` (add export)
- Test: `tests/chunk-model.test.ts`

**Interfaces:**
- Produces: `Chunk` (model), `IChunk` `{ _id: string; workspaceId: string; knowledgeBaseId: string; documentId: string; ord: number; text: string; embedding: number[]; tokens: number; createdAt: Date; updatedAt: Date }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/chunk-model.test.ts
import { describe, it, expect } from "vitest";
import { Chunk } from "@/lib/db/models/Chunk";

describe("Chunk model", () => {
  it("requires workspaceId, documentId, ord and text", () => {
    const err = new Chunk({}).validateSync();
    expect(err?.errors.workspaceId).toBeDefined();
    expect(err?.errors.documentId).toBeDefined();
    expect(err?.errors.ord).toBeDefined();
    expect(err?.errors.text).toBeDefined();
  });

  it("accepts an embedding vector and defaults tokens to 0", () => {
    const chunk = new Chunk({
      workspaceId: "w1",
      knowledgeBaseId: "kb1",
      documentId: "d1",
      ord: 0,
      text: "hello world",
      embedding: [0.1, 0.2, 0.3],
    });
    expect(chunk.validateSync()).toBeUndefined();
    expect(chunk.embedding).toHaveLength(3);
    expect(chunk.tokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chunk-model.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/db/models/Chunk.ts
import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IChunk {
  _id: string;
  workspaceId: string;
  knowledgeBaseId: string;
  documentId: string;
  ord: number;
  text: string;
  embedding: number[];
  tokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const ChunkSchema = new Schema<IChunk>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    knowledgeBaseId: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    ord: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    tokens: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
);

// The Atlas Vector Search index on `embedding` is created out of band
// (Atlas API/UI) in the Retrieval Core sub-project, not here.

export const Chunk: Model<IChunk> =
  mongoose.models.Chunk || mongoose.model<IChunk>("Chunk", ChunkSchema);
```

Add to `lib/db/index.ts`:

```ts
export { Chunk, type IChunk } from "./models/Chunk";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chunk-model.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/models/Chunk.ts lib/db/index.ts tests/chunk-model.test.ts
git commit -m "Add the chunk model for embedded text"
```

---

### Task 6: Permission resolver (security-critical, pure)

This is the single source of truth for "which documents may this user see". It is a **pure function** (no DB) so it can be exhaustively unit-tested. Every retrieval query in later sub-projects filters by its output.

**Policy:** `workspace`-mode documents are visible to every member. `restricted` documents are visible only to users whose id is in `allowedUserIds` OR whose role is in `allowedRoles`. There is **no implicit admin/owner bypass** — blanket admin access, if wanted later, is granted explicitly by adding `"owner"`/`"admin"` to a document's `allowedRoles`. Safe-by-default.

**Files:**
- Create: `lib/workspaces/permissions.ts`
- Test: `tests/permission-resolver.test.ts`

**Interfaces:**
- Consumes: `Role` (from Task 2), `IDocumentAcl` (from Task 4).
- Produces:
  - `interface DocRef { _id: string; acl: IDocumentAcl }`
  - `interface AccessContext { userId: string; role: Role }`
  - `function userCanSeeDocument(doc: DocRef, ctx: AccessContext): boolean`
  - `function resolveAllowedDocumentIds(docs: DocRef[], ctx: AccessContext): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/permission-resolver.test.ts
import { describe, it, expect } from "vitest";
import {
  userCanSeeDocument,
  resolveAllowedDocumentIds,
  type DocRef,
} from "@/lib/workspaces/permissions";

const member = { userId: "u1", role: "member" as const };

describe("userCanSeeDocument", () => {
  it("shows workspace-mode documents to any member", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "workspace" } };
    expect(userCanSeeDocument(doc, member)).toBe(true);
  });

  it("hides a restricted document from a user not on any allow-list", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted" } };
    expect(userCanSeeDocument(doc, member)).toBe(false);
  });

  it("shows a restricted document to a user on allowedUserIds", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedUserIds: ["u1"] } };
    expect(userCanSeeDocument(doc, member)).toBe(true);
  });

  it("shows a restricted document to a user whose role is allowed", () => {
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedRoles: ["member"] } };
    expect(userCanSeeDocument(doc, member)).toBe(true);
  });

  it("does not give owners an implicit bypass of restricted documents", () => {
    const owner = { userId: "u9", role: "owner" as const };
    const doc: DocRef = { _id: "d1", acl: { mode: "restricted", allowedUserIds: ["u1"] } };
    expect(userCanSeeDocument(doc, owner)).toBe(false);
  });
});

describe("resolveAllowedDocumentIds", () => {
  it("returns only the ids the user may see", () => {
    const docs: DocRef[] = [
      { _id: "d1", acl: { mode: "workspace" } },
      { _id: "d2", acl: { mode: "restricted", allowedUserIds: ["u1"] } },
      { _id: "d3", acl: { mode: "restricted", allowedRoles: ["admin"] } },
    ];
    expect(resolveAllowedDocumentIds(docs, member)).toEqual(["d1", "d2"]);
  });

  it("returns an empty array when nothing is visible", () => {
    const docs: DocRef[] = [{ _id: "d1", acl: { mode: "restricted" } }];
    expect(resolveAllowedDocumentIds(docs, member)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/permission-resolver.test.ts`
Expected: FAIL — cannot find module `@/lib/workspaces/permissions`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/workspaces/permissions.ts
import type { Role } from "@/lib/db/models/Membership";
import type { IDocumentAcl } from "@/lib/db/models/KnowledgeDocument";

export interface DocRef {
  _id: string;
  acl: IDocumentAcl;
}

export interface AccessContext {
  userId: string;
  role: Role;
}

/**
 * Whether a single document is visible to a user. Workspace-mode documents are
 * visible to every member; restricted documents only to an allowed user id or
 * an allowed role. No implicit owner/admin bypass — that is granted explicitly
 * via allowedRoles when desired.
 */
export function userCanSeeDocument(doc: DocRef, ctx: AccessContext): boolean {
  if (doc.acl.mode === "workspace") return true;
  if (doc.acl.allowedUserIds?.includes(ctx.userId)) return true;
  if (doc.acl.allowedRoles?.includes(ctx.role)) return true;
  return false;
}

/** The ids of every document in `docs` this user may see. */
export function resolveAllowedDocumentIds(docs: DocRef[], ctx: AccessContext): string[] {
  return docs.filter((doc) => userCanSeeDocument(doc, ctx)).map((doc) => doc._id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/permission-resolver.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/workspaces/permissions.ts tests/permission-resolver.test.ts
git commit -m "Add the document permission resolver"
```

---

### Task 7: Workspace service + seed a personal workspace on sign-in

Creates the DB-backed helpers other sub-projects call, and seeds a personal workspace (with an `owner` membership) the first time each user signs in. Because these touch the database, they are verified on the **live** suite, not the mocked one.

**Files:**
- Create: `lib/workspaces/service.ts`
- Modify: `lib/auth.ts` (extend the `signIn` callback)
- Test: `tests/live/workspaces.live.test.ts`

**Interfaces:**
- Consumes: `connectToDatabase`, `Workspace` (Task 1), `Membership` (Task 2), `Role` (Task 2).
- Produces:
  - `async getOrCreatePersonalWorkspace(userId: string): Promise<string>` — returns the workspace id; idempotent.
  - `async getUserMemberships(userId: string): Promise<IMembership[]>`
  - `async getWorkspaceRole(workspaceId: string, userId: string): Promise<Role | null>`

- [ ] **Step 1: Write the failing live test**

```ts
// tests/live/workspaces.live.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.live.config.ts tests/live/workspaces.live.test.ts`
Expected: FAIL — cannot find module `@/lib/workspaces/service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/workspaces/service.ts
import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/lib/db/models/Workspace";
import { Membership, type IMembership, type Role } from "@/lib/db/models/Membership";

/**
 * The id of the user's personal workspace, creating it (and an owner
 * membership) on first call. Idempotent — safe to call on every sign-in.
 */
export async function getOrCreatePersonalWorkspace(userId: string): Promise<string> {
  await connectToDatabase();

  const existing = await Workspace.findOne({ ownerUserId: userId, personal: true });
  if (existing) return existing._id;

  const workspace = await Workspace.create({
    name: "Personal",
    ownerUserId: userId,
    personal: true,
  });
  await Membership.create({ workspaceId: workspace._id, userId, role: "owner" });
  return workspace._id;
}

export async function getUserMemberships(userId: string): Promise<IMembership[]> {
  await connectToDatabase();
  return Membership.find({ userId }).lean();
}

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string
): Promise<Role | null> {
  await connectToDatabase();
  const membership = await Membership.findOne({ workspaceId, userId }).lean();
  return membership?.role ?? null;
}
```

- [ ] **Step 4: Run the live test to verify it passes**

Run: `npx vitest run --config vitest.live.config.ts tests/live/workspaces.live.test.ts`
Expected: PASS (1 test). Requires a real `MONGODB_URI` in `.env`.

- [ ] **Step 5: Seed the workspace on sign-in**

In `lib/auth.ts`, extend the existing `signIn` callback so it also seeds the personal workspace next to the credits call:

```ts
callbacks: {
  ...authConfig.callbacks,
  async signIn({ user }) {
    if (user.id) {
      const { getOrCreateCredits } = await import("@/lib/credits");
      const { getOrCreatePersonalWorkspace } = await import("@/lib/workspaces/service");
      await getOrCreateCredits(user.id);
      await getOrCreatePersonalWorkspace(user.id);
    }
    return true;
  },
},
```

- [ ] **Step 6: Verify the full suite and typecheck**

Run: `npx tsc --noEmit` — expect no new errors.
Run: `npm test` — expect all unit tests green (Tasks 1–6).
Run: `npm run test:live` — expect the workspace live test green (and the existing live suite unaffected).

- [ ] **Step 7: Commit**

```bash
git add lib/workspaces/service.ts lib/auth.ts tests/live/workspaces.live.test.ts
git commit -m "Give every account a personal workspace on sign-in"
```

---

## Self-Review

**Spec coverage (against §3 of the design doc):**
- `Workspace` → Task 1 ✓
- `Membership` + roles (RBAC table) → Task 2 ✓
- `KnowledgeBase` → Task 3 ✓
- `Document` + per-document ACL → Task 4 ✓ (named `KnowledgeDocument` to avoid the DOM `Document` clash — documented deviation)
- `Chunk` (embedding + denormalized `workspaceId`/`documentId`) → Task 5 ✓
- Permission resolver (server-side, single choke point) → Task 6 ✓
- Personal workspace seeded on signup (§3: "seed alongside `getOrCreateCredits`") → Task 7 ✓
- Atlas vector index → intentionally deferred to the Retrieval Core sub-project (noted in Task 5), per §5.
- Ingestion/retrieval/node/chat/cross-cutting → later sub-projects, out of scope here. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"add validation" — every step has real code and a real command. ✓

**Type consistency:** `Role` defined in Task 2 and consumed by Tasks 6 & 7 under the same name. `IDocumentAcl` defined in Task 4 and consumed by Task 6. `getOrCreatePersonalWorkspace` signature identical in Task 7 Step 3 and the `lib/auth.ts` wiring in Step 5. Model registration guard and string-uuid `_id` pattern identical across Tasks 1–5. ✓

**Scope:** Single subsystem (foundation data model + permissions). Produces working, independently testable software (models validate; resolver enforces; signup seeds a workspace). ✓
