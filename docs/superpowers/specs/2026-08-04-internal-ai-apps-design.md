# Internal AI Apps Platform — Design

**Date:** 2026-08-04
**Status:** Draft for review
**Scope:** Turn a Flowys workflow into a polished, governed **internal app** that non-builders in a workspace just *use* — an auto-generated form, a live observable run, cited results — with per-app access control, versioning, run history, audit, and analytics. Built to an enterprise bar (no lean-mode features), decomposed into six ordered sub-projects.

---

## 1. Goal & context

Today the product is a builder's canvas: you assemble a workflow and run it yourself. A non-technical colleague can't benefit without learning the canvas — and a skeptic can replicate a single input→output run in free ChatGPT. This feature closes that gap: a builder **publishes a workflow as an internal app**, and any permitted teammate opens a clean branded page, fills a form, watches it run, and gets a cited, formatted result — never touching the canvas. It reuses the existing (unbuilt) `preview/[listingId]` "listing" concept for real.

This is the frontend flagship of the enterprise story: it makes Flowys an **internal AI-app portal**, not a wrapper around a model call.

### Decisions locked during brainstorming
- **Feature:** publish a workflow as an app; **auto-generated form** interaction (not chat).
- **Access:** internal team only (logged-in workspace members), with **per-app RBAC** (everyone / specific roles / named people).
- **Run identity:** runs execute with **the publisher's connections and keys** (zero setup for colleagues), **audited under the runner**.
- **Versioning:** a live app runs a **frozen snapshot**; workflow edits don't affect it until the owner **republishes**; **rollback** to any prior version.
- **Ambition:** full enterprise feature set (observable runs, history, audit, analytics, governance, portal), designed complete, built as ordered sub-projects.

### Dependency
This feature requires the **workspace/membership** model, which lives on the `feature/rag-foundation` branch (Workspace, Membership, `getWorkspaceRole`, the permission-resolver pattern). It stacks on that branch.

### Non-goals (deliberate, with reasons)
- **Public / external apps** — internal-only for now; a public-link mode is a later access-model extension.
- **Human-in-the-loop approvals** — genuinely valuable, but doing it well needs engine **pause/resume (durable execution)**, which does not exist yet (Reliability track). Designing it now would ship something fragile, which contradicts the enterprise bar. Explicitly deferred until durable execution lands.
- **Full SSO/SAML** — governance track; this feature consumes workspace roles, it does not add SSO.

---

## 2. Architecture & module map

**One core concept: an *App Listing*** — a published, runnable face of a workflow, tying together a **workflow** (user-owned), a **workspace** (the audience), and a **frozen version** (a snapshot so the app is stable).

**Publish flow**
```
Builder → "Publish as app" panel (title, brand, visible fields, audience)
  → freeze current workflow definition into an AppVersion (snapshot)
  → create/update AppListing (points at current AppVersion)
  → audit event: app.publish
```

**Run flow (shared by the app page)**
```
Member opens /apps/[id]
  → access check (workspace membership + per-app audience)
  → auto-form built from the snapshot's input fields
  → submit → access + rate-limit + cost-cap checks
  → execute snapshot via engine, resolving integration connections
    against the PUBLISHER's account, attributed to the runner
  → stream step-by-step updates (live run) → formatted result + citations
  → record an AppRun (audit + history + analytics); audit event: app.run
```

**Modules**

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/apps/model` | AppListing / AppVersion / AppRun / AppFavorite / AuditEvent schemas | workspaces, workflow |
| `lib/apps/access` | per-app audience resolution + membership gate | workspaces (`getWorkspaceRole`) |
| `lib/apps/publish` | snapshot, versioning, rollback | model, WorkflowVersion |
| `lib/apps/run` | publisher-context execution, rate/cost limits, run recording | engine, credits, RateLimit, Connection |
| `lib/apps/audit` | append-only audit log + analytics aggregation | model |
| `app/apps/*` + `app/api/apps/*` | portal, app page (form + live run), manage/admin, run APIs | all of the above |

The **run service** and the **access check** are single choke points — the app page, the API, and any future surface all go through them, so security and metering live in one place.

---

## 3. Data model

New Mongoose models in `lib/db/models/`, string-uuid `_id`, following the existing convention. All carry `workspaceId`.

- **`AppListing`** — `{ _id, workspaceId, workflowId, ownerUserId, slug, title, description, icon, color, category, visibleFields: string[], audience: { mode: "workspace" | "roles" | "users", roles?: Role[], userIds?: string[] }, currentVersionId, status: "draft" | "published" | "unpublished", settings: { rateLimitPerHour?: number, costCapPerRun?: number, retentionDays?: number }, createdAt, updatedAt }`.
- **`AppVersion`** — `{ _id, appListingId, workspaceId, version: number, snapshot: { nodes, edges }, publishedByUserId, note?, createdAt }`. Immutable. Rollback = point `AppListing.currentVersionId` at an older row.
- **`AppRun`** — `{ _id, appListingId, appVersionId, workspaceId, runByUserId, input, output, status: "running"|"completed"|"failed", logs, error?, cost, durationMs, startedAt, completedAt }`. Audit-grade run record; powers history + analytics.
- **`AppFavorite`** — `{ _id, workspaceId, userId, appListingId }` (unique on `userId+appListingId`).
- **`AuditEvent`** — `{ _id, workspaceId, actorUserId, action: "app.publish"|"app.edit"|"app.unpublish"|"app.rollback"|"app.run"|"app.access_denied", targetType: "app", targetId, metadata, createdAt }`. Append-only.

---

## 4. Access control (per-app RBAC)

`lib/apps/access.ts` — a pure decision plus a DB-backed gate:
- `userCanAccessApp(listing, ctx: { userId, role: Role | null }): boolean` — pure. `false` if not a workspace member (`role` null). Then by `audience.mode`: `workspace` → any member; `roles` → `ctx.role ∈ audience.roles`; `users` → `ctx.userId ∈ audience.userIds`.
- The gate resolves the caller's role via the workspace `getWorkspaceRole(listing.workspaceId, userId)` and applies the pure check. Enforced on **open** and **run** — server-side, in one place. A denied attempt writes an `app.access_denied` audit event. Managing an app (edit/publish/rollback/settings) requires `owner`/`admin`.

---

## 5. Execution model (the hard part)

- **Publisher context for connections.** When a run reaches an `integration`/`api` node needing a stored connection or key, the run resolves it against **`listing.ownerUserId`** (the publisher), not the runner — so a colleague needs no connections of their own. The engine/integration resolution takes a `connectionOwnerUserId` context; the run service passes the publisher's id. *(Integration point to build: connection resolution currently scopes to the acting user; the run path must resolve against the publisher.)*
- **Runner identity for audit + metering.** The `AppRun` and audit event are attributed to `runByUserId`.
- **Rate limits + cost caps.** Before executing: `RateLimit` check keyed by `app:{id}:user:{runner}` against `settings.rateLimitPerHour`; a per-run cost estimate (`calculateWorkflowCost`) checked against `settings.costCapPerRun`. Over-limit → a plain-language refusal, no run, an audit event.
- **Isolated, recorded run.** Executes the frozen `AppVersion.snapshot` through `createExecutor`, streaming node updates (§7), then finalizes the `AppRun`.

---

## 6. Versioning & safe publishing

- **Draft vs Published vs Unpublished** status on the listing.
- **Publish/Update** freezes the current workflow definition into a new `AppVersion` (monotonic `version`) and repoints `currentVersionId`. The live app always runs `currentVersionId`'s snapshot — never the in-progress canvas.
- **Update-available indicator:** when the source workflow's `updatedAt` is newer than the current version's `createdAt`, the builder sees an "Update app" badge.
- **Rollback:** repoint `currentVersionId` to any prior `AppVersion`; audited.
- Leans on the existing `WorkflowVersion` model where useful, but the app's snapshot is owned by `AppVersion` so an app's history is independent of ad-hoc workflow versioning.

---

## 7. Live, observable runs

The app page is not a black box. Using the executor's existing `onNodeUpdate` callback and the SSE pattern from `app/api/workflows/[id]/execute/stream`:
- Steps **light up in real time**; each shows its status, a readable summary of its output, and its cost.
- The final result **streams in**, rendered as formatted text (reusing the existing markdown/output rendering), with **source citations** when the workflow uses a knowledge/retrieval step (forward-compatible with the RAG feature).
- A failed run shows the engine's plain-language error analysis (which already exists) at the failing step — no stack traces, no jargon.

---

## 8. Run history, audit & analytics

- **Per-user history** on each app page: past `AppRun`s for the current user — re-run with the same inputs, open a past result, copy a shareable result link (workspace-gated).
- **Admin audit view** (owner/admin): the `AuditEvent` stream for an app — who published, edited, ran, was denied — with retained inputs/outputs per `retentionDays`.
- **Per-app analytics dashboard:** runs over time, top users, success rate, average duration, total cost, and an **estimated hours-saved / ROI** figure (configurable minutes-saved-per-run × completed runs) — the renewal-justifying number.
- **Retention:** a scheduled cleanup (reusing the `node-cron` scheduler) purges `AppRun` payloads older than `settings.retentionDays`.

---

## 9. Governance & data handling

- **Append-only audit log** (`AuditEvent`) for every publish/edit/unpublish/rollback/run/denied-access.
- **Configurable result retention** per app.
- **Least-privilege by default:** new apps default `audience.mode = "workspace"`; managing requires owner/admin; access denials are logged.
- No raw JSON, schema words, or model jargon anywhere in the UI (the product's core rule) — audit and analytics render in plain language.

---

## 10. The portal (discovery)

A workspace **Apps portal** at `app/apps/`:
- Branded **cards** (icon, colour, title, description).
- **Search**, **categories**, **favorites**, and **most-used** rails.
- Empty state that invites publishing the first app.
- Feels like a company's internal AI-app store.

The builder gains a **"Publish as app"** action + settings panel (title, description, icon/colour, category, which input fields to expose, audience, rate/cost/retention). The manage surface (`app/apps/[id]/manage`) holds settings, versions/rollback, audit, and analytics.

---

## 11. Build decomposition (six ordered sub-projects)

Each becomes its own implementation plan (`writing-plans`), built and reviewed in order. Chain: **1 → 2 → 3 → (4 ∥ 5) → 6**.

1. **App model + publish/version engine + access model** — `AppListing`/`AppVersion` schemas, snapshot/publish/rollback, the pure `userCanAccessApp` + membership gate. (Backbone; unit-testable.)
2. **Run engine** — publisher-context execution, rate-limit + cost-cap gates, `AppRun` recording, the connection-owner integration point.
3. **App page** — auto-generated form from the snapshot's input fields, live observable run (streamed steps), formatted result + citations, per-user history drawer, re-run.
4. **Portal** — gallery, search, categories, favorites, most-used; the builder's Publish action + settings panel.
5. **History, audit & analytics** — admin audit view, per-app analytics dashboard + ROI, retention cleanup job.
6. **Governance + cross-cutting polish** — audit-log completeness, retention settings UI, plain-language pass, accessibility, responsive, dark mode.

---

## 12. Testing strategy (two-suite rule)

- **Unit (mocked):** the pure access decision (`userCanAccessApp`) — security-critical; form-field derivation from a snapshot; version/rollback pointer logic; rate-limit + cost-cap decision; audit-event shaping; analytics aggregation math.
- **Live (`npm run test:live`):** the real run path (publisher-context execution + streaming), rate-limit enforcement against real records, and end-to-end publish→run→record. This is exactly the schema/engine/provider class the live suite exists to catch.
- **App-as-a-user check:** after the run engine + app page land, sign up, publish a template as an app, and run it as a second workspace member — the real acceptance test.

---

## 13. New models, surfaces & external decisions

- **New models:** `AppListing`, `AppVersion`, `AppRun`, `AppFavorite`, `AuditEvent`.
- **New API:** `app/api/apps` (CRUD + publish/update/rollback), `app/api/apps/[id]/run` + `/run/stream`, `app/api/apps/[id]/runs` (history), `app/api/apps/[id]/audit`, `app/api/apps/[id]/analytics`, `app/api/apps/[id]/favorite`.
- **New UI:** `app/apps` (portal), `app/apps/[id]` (run page), `app/apps/[id]/manage` (settings/versions/audit/analytics), builder Publish panel.
- **Vocabulary:** add app/run/audience/version terms to `lib/vocabulary.ts` (plain language only).
- **Integration point to confirm:** connection resolution must accept a publisher-owner context so runs use the publisher's connections.

---

## 14. Open questions

1. Analytics "hours saved" — a single configurable minutes-per-run per app, or a global default? (Assumed: per-app, default 15 min.)
2. Result sharing — a shareable result link is workspace-gated; confirm no external sharing in this phase.
3. Slugs — human-readable per-workspace slugs for app URLs, or opaque ids? (Assumed: slug, unique per workspace.)
4. Retention default — assumed 90 days of run payloads; confirm.
