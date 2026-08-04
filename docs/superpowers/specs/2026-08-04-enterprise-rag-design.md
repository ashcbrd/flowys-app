# Enterprise RAG for Flowys — Phase 1 Design

**Date:** 2026-08-04
**Status:** Draft for review
**Scope:** Phase 1 of the enterprise roadmap — Retrieval-Augmented Generation, built
to the "full enterprise" bar (Approach B), decomposed into six ordered sub-projects
that ship in dependency order.

---

## 1. Goal & context

Flowys is a visual AI-workflow tool. Today an `ai` step only knows what the model
was trained on plus whatever an earlier step passed it. RAG lets a workflow — and a
standalone chat surface — answer from a customer's **own documents**, with citations,
under enterprise access control.

This is the revenue/"WOW" phase of the roadmap. The defining enterprise requirement,
chosen during brainstorming, is **org-shared knowledge bases with per-document
permissions**: a user only ever retrieves chunks from documents they are allowed to
see, enforced server-side in one place.

### Decisions locked during brainstorming
- **Surface:** a `retrieval` workflow node *and* a chat-over-docs surface, both over one
  shared knowledge base.
- **Sources:** file uploads + URL/website + live connectors (Drive/Notion/SharePoint),
  behind one pluggable adapter interface.
- **Vector store:** MongoDB Atlas Vector Search (no new datastore — reuses existing Atlas).
- **Access model:** org-shared KBs + per-document ACLs.
- **Approach:** B ("full enterprise"), delivered as six sub-specs in build order.

### Non-goals for Phase 1
- Full SSO/SAML and the complete RBAC admin UI (Phase 3 — this phase introduces the
  minimal `Workspace`/`Membership` seam they grow into, so there is no later migration).
- A durable job queue (Phase 2 — this phase uses a minimal cron-driven processor).

---

## 2. Architecture & module map

Everything scopes to a **Workspace** (the org primitive). Two flows:

**Ingest flow**
```
Source (upload / URL / connector)
  -> Adapter          fetch + normalize + capture source ACLs
  -> Extractor        PDF/DOCX/HTML -> clean text
  -> Chunker          split + overlap, carry metadata
  -> Embedder         text -> vector, batched
  -> Index            Chunk docs written to Mongo (embedding + ACL + workspaceId)
```

**Query flow (shared by node AND chat)**
```
Question + { workspaceId, userId }
  -> Permission resolver   which documentIds may this user see?
  -> Retriever             Atlas $vectorSearch + keyword, filtered by workspace + allowed docs
  -> Reranker              reorder top-K by relevance
  -> Answer builder        LLM over retrieved chunks -> answer + citations
```

**Modules & boundaries**

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/workspaces/` | orgs, membership, roles, permission checks | auth |
| `lib/knowledge/model` | KB / Document / Chunk schemas + ACLs | workspaces |
| `lib/knowledge/ingest` | adapters -> extract -> chunk -> embed -> index | model |
| `lib/knowledge/retrieval` | vector + hybrid search, rerank, ACL filter, citations | model |
| `lib/nodes/retrieval.ts` | the "Search knowledge" workflow node | retrieval |
| `app/knowledge/*`, `app/api/knowledge/*` | chat surface + KB management | retrieval, ingest |

The retrieval **service** is the single choke point: the node and the chat UI both call
it, so ACL enforcement lives in exactly one place. This is what makes per-document
permissions trustworthy.

---

## 3. Data model (the foundation)

New Mongoose collections in `lib/db/models/`, all carrying `workspaceId`. Ids are string
uuids to match the existing convention (see `UserCredits`, `User`).

- **`Workspace`** — `{ _id, name, ownerUserId, createdAt, updatedAt }`. Every user gets a
  personal workspace on signup (seed alongside `getOrCreateCredits` in the NextAuth
  `signIn` callback).
- **`Membership`** — `{ _id, workspaceId, userId, role: "owner"|"admin"|"member"|"viewer" }`.
  Unique index on `(workspaceId, userId)`. This is the RBAC table.
- **`KnowledgeBase`** — `{ _id, workspaceId, name, description, defaultVisibility, createdAt }`.
- **`Document`** — `{ _id, workspaceId, knowledgeBaseId, source: { type, ref }, title,
  status: "pending"|"processing"|"ready"|"failed", error?, acl: { mode: "workspace"|"restricted",
  allowedUserIds?: string[], allowedRoles?: string[] }, checksum, chunkCount, createdAt, updatedAt }`.
  **The ACL lives here, at the document.**
- **`Chunk`** — `{ _id, workspaceId, knowledgeBaseId, documentId, ord, text, embedding: number[],
  tokens }`. Denormalizes `workspaceId` + `documentId` so a single `$vectorSearch` filters
  without a join. The Atlas vector index is defined on `embedding`.

### Permission enforcement
The permission resolver computes the set of `documentId`s a user may see: all documents
with `acl.mode === "workspace"` in their workspace, plus `restricted` documents where the
user is in `allowedUserIds` or their role is in `allowedRoles`. Every `$vectorSearch` and
`$search` is filtered to `workspaceId == X AND documentId IN (allowed)`. No allowed-doc
match -> no chunk returned. Enforcement is server-side, in the retrieval service only —
never in the client, never duplicated.

### Relationship to existing isolation
This extends the isolation pattern already in the codebase (scope-by-`userId`,
`getUserWorkflowIds`/`userOwnsWorkflow` in `lib/auth-helpers.ts`). Knowledge scopes by
`workspaceId` + membership. Workflows/executions stay user-scoped for now and gain
workspace-awareness in a later phase.

---

## 4. Ingestion pipeline

### Adapters (`SourceAdapter` interface, built in order)
1. **`UploadAdapter`** — multipart upload -> blob storage; simplest, ships first.
2. **`UrlAdapter`** — fetch + depth-1 crawl, reusing the existing SSRF guard; HTML -> readable text.
3. **`ConnectorAdapter`** — wraps the existing `lib/integrations` OAuth framework
   (Drive/Notion/SharePoint). Captures source-side permissions into `Document.acl`.

### Stages
- **Extract** — PDF (`unpdf`), DOCX (`mammoth`), HTML (readability), txt/md direct. New
  dependencies, isolated in `lib/knowledge/ingest/extractors/`.
- **Chunk** — ~500 tokens, ~12% overlap, headings carried as chunk metadata.
- **Embed** — OpenAI `text-embedding-3-small` (1536-dim) through the existing provider
  layer, batched. Embedding dimension MUST match the Atlas index definition.
- **Index** — write `Chunk` documents; the Atlas vector index picks them up.

### Async processing without Phase 2's queue
A `Document` **state machine** (`pending -> processing -> ready | failed`). On upload the
document is created `pending`; a **cron-driven processor** (reusing the existing
`node-cron` scheduler in `lib/services/scheduler.ts`) claims pending documents, processes
with bounded retries, and transitions status. No new infrastructure; upgrades cleanly to a
real queue in Phase 2 by swapping the claim mechanism.

---

## 5. Retrieval core

Single service: `retrieve({ workspaceId, userId, query, knowledgeBaseId, topK })`.

1. **Permission resolver** -> allowed `documentId`s (section 3).
2. **Hybrid search** — Atlas `$vectorSearch` (semantic) + Atlas `$search` (keyword),
   fused with **Reciprocal Rank Fusion (RRF)** in application code. Both stages `filter`ed
   to `workspaceId` + allowed docs.
3. **Rerank** — a pluggable `Reranker` interface. Default: Cohere rerank or an LLM-based
   reranker (provider dependency — flagged as a decision to confirm).
4. **Citations** — every returned chunk carries `{ documentId, title, ord }`.

The Atlas vector index is defined via the Atlas API/UI (JSON index definition on
`Chunk.embedding` with `numDimensions: 1536` and `filter` fields `workspaceId`,
`documentId`). Because a mocked test cannot exercise `$vectorSearch`, retrieval is covered
by the **live** suite (section 8).

---

## 6. Retrieval node

A new `retrieval` node type. Per CLAUDE.md, adding a step type is four things, all of them:
1. **Handler** — `lib/nodes/retrieval.ts` implementing `NodeHandler`.
2. **Type entry** — in `lib/nodes/types.ts` and the node registry.
3. **Vocabulary** — plain-language terms in `lib/vocabulary.ts` ("Search knowledge", never
   "vector" / "embedding" / "RAG" in the UI).
4. **Live test** — real embeddings + `$vectorSearch`.

Config: knowledge base, query template (`{{...}}` interpolation like other nodes), top-K.
Output: retrieved context + citations, consumed by a downstream `ai` node. Runs through the
same retrieval service, so ACLs are enforced identically to the chat surface.

---

## 7. Chat-over-docs surface

`app/knowledge/` — choose a KB, ask a question, get a **streamed** answer (reusing the SSE
pattern from `app/api/workflows/[id]/execute/stream`) with inline, clickable citations back
to the source document. Plus KB management UI: upload files, connect a source, watch
document status (`pending`/`processing`/`ready`/`failed`). API under `app/api/knowledge/*`,
all workspace-scoped and behind auth via `middleware.ts`.

---

## 8. Cross-cutting concerns

- **Embeddings provider abstraction** — swap models behind one interface; dimension must
  match the Atlas index.
- **Freshness / re-index** — per-document checksum; connectors re-sync on a schedule;
  changed documents re-chunk and re-embed.
- **Metering** — extend `CREDIT_COSTS` in `lib/credits.ts` with embedding + retrieval costs.
- **Security** — ACLs enforced server-side only; connector credentials encrypted with the
  existing `Connection` crypto; SSRF guard on URL crawl; strict per-workspace isolation.
- **Observability** — ingestion and retrieval logs, plus a query log to enable future
  retrieval-quality evaluation.

---

## 9. Build order & milestones

Each sub-project below becomes its own implementation plan (`writing-plans`), built in order.
Dependency chain: **1 -> 2 -> 3 -> (4 || 5)**, with 6 threaded throughout.

1. **Enterprise Foundation** — `Workspace`, `Membership`, roles, and the
   `KnowledgeBase`/`Document`/`Chunk` schemas + per-document ACLs. Seed a personal
   workspace on signup. Verifiable in isolation (models + permission resolver unit tests).
2. **Ingestion pipeline** — adapters (upload -> URL -> connectors), extractors, chunker,
   embedder, indexer, and the cron-driven async processor with the `Document` state machine.
3. **Retrieval core** — Atlas vector index, hybrid search + RRF, reranker, ACL-filtered
   queries, citations.
4. **Retrieval node** — engine integration (handler + type + vocabulary + live test).
5. **Chat-over-docs surface** — management UI + streamed, cited answers.
6. **Cross-cutting** — embeddings abstraction, freshness/re-index, metering, observability,
   security hardening.

---

## 10. Testing strategy (the two-suite rule)

Per `CLAUDE.md`, the mocked unit suite proves logic and the live suite proves reality;
schema/model/provider changes require `npm run test:live`.

- **Unit (mocked):** chunking, RRF fusion, the **ACL/permission resolver** (security-critical),
  document state-machine transitions, vocabulary mapping.
- **Live (`npm run test:live`):** embeddings generation, Atlas `$vectorSearch`, end-to-end
  retrieval with ACL filtering, and the retrieval node. This is exactly the class of change
  (new schema shapes, a new provider call, a new model identifier) the live suite exists to
  catch — a green unit run is not sufficient evidence for any of it.

---

## 11. New dependencies & external decisions to confirm

- **Extraction libs:** `unpdf` (PDF), `mammoth` (DOCX), an HTML readability lib.
- **Embeddings:** OpenAI `text-embedding-3-small` (already have the OpenAI provider).
- **Reranker:** Cohere rerank vs. LLM-rerank — a provider decision to confirm before
  building the retrieval core.
- **Atlas Vector Search:** must be enabled on the cluster; the vector index is created out of
  band (Atlas API/UI), not by Mongoose.
- **Blob storage** for uploaded originals (e.g., Vercel Blob) — to confirm.

---

## 12. Open questions

1. Reranker provider (Cohere vs LLM-rerank)?
2. Blob storage choice for original uploaded files?
3. Which connector ships first in sub-project 2 (Drive is the assumed default)?
4. Embedding model tier — `text-embedding-3-small` (1536, cheaper) vs `-large` (3072)?
