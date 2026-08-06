import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import {
  connectToDatabase,
  User,
  Workspace,
  Membership,
  KnowledgeBase,
  KnowledgeDocument,
  Chunk,
} from "@/lib/db";
import { ingestText, getOrCreateDefaultKnowledgeBase, INLINE_CHUNK_LIMIT } from "@/lib/knowledge/ingest";
import { processPendingDocuments } from "@/lib/knowledge/processor";
import { getOrCreatePersonalWorkspace } from "@/lib/workspaces/service";
import { retrieve } from "@/lib/knowledge/retrieval";

/**
 * The async path, end to end and unmocked.
 *
 * Indexing used to run inside the upload request, which works for a pasted FAQ
 * and times out on a real policy document. This proves the queued path: a
 * document too large to index inline is accepted immediately as `pending`,
 * indexed by the worker afterwards, and then actually searchable.
 */

const hasEnv = !!process.env.MONGODB_URI && !!process.env.OPENAI_API_KEY;
const live = hasEnv ? describe : describe.skip;

/** Comfortably past INLINE_CHUNK_LIMIT so the queued branch is taken. */
function bigDocument(): string {
  const sections = [];
  for (let i = 0; i < INLINE_CHUNK_LIMIT + 10; i++) {
    sections.push(
      `# Section ${i}\n\nPolicy paragraph number ${i}. ` +
        Array.from({ length: 60 }, (_, w) => `detail${i}x${w}`).join(" ")
    );
  }
  // One section carries a fact nothing else does, to prove retrieval works
  // against what the worker indexed rather than merely that rows exist.
  sections.push(
    "# Parking\n\nThe barrier code for the staff car park is 7731 and it changes each quarter."
  );
  return sections.join("\n\n");
}

live("queued indexing", () => {
  const userId = `test-user-${uuid()}`;
  let workspaceId: string;
  let knowledgeBaseId: string;

  beforeAll(async () => {
    await connectToDatabase();
    await User.create({
      _id: userId,
      email: `${userId}@example.com`,
      passwordHash: "scrypt$00$00",
    });
    workspaceId = await getOrCreatePersonalWorkspace(userId);
    knowledgeBaseId = await getOrCreateDefaultKnowledgeBase(workspaceId);
  }, 120_000);

  afterAll(async () => {
    await Chunk.deleteMany({ workspaceId });
    await KnowledgeDocument.deleteMany({ workspaceId });
    await KnowledgeBase.deleteMany({ workspaceId });
    await Membership.deleteMany({ userId });
    await Workspace.deleteMany({ ownerUserId: userId });
    await User.deleteMany({ _id: userId });
  }, 60_000);

  it("accepts a large document immediately, then indexes and serves it", async () => {
    const queued = await ingestText({
      workspaceId,
      knowledgeBaseId,
      title: "Staff handbook",
      text: bigDocument(),
    });

    // The upload returns without doing the embedding work, which is the whole
    // point: this is the call that used to time out.
    expect(queued.status).toBe("pending");
    expect(queued.chunkCount).toBe(0);

    // Nothing is searchable yet, because retrieval only reads `ready`.
    const tooEarly = await retrieve({
      workspaceId,
      userId,
      query: "what is the car park barrier code",
      topK: 3,
    });
    expect(tooEarly).toEqual([]);

    // The worker picks it up.
    const result = await processPendingDocuments();
    expect(result.claimed).toBeGreaterThan(0);
    expect(result.ready).toBeGreaterThan(0);

    const document = await KnowledgeDocument.findById(queued.documentId).lean();
    expect(document!.status).toBe("ready");
    expect(document!.chunkCount).toBeGreaterThan(INLINE_CHUNK_LIMIT);
    // The source text is dropped once the chunks exist; keeping both would
    // double storage for no benefit.
    expect(document!.pendingText).toBeUndefined();

    // And it answers, which is the only proof that matters.
    const hits = await retrieve({
      workspaceId,
      userId,
      query: "what is the car park barrier code",
      topK: 3,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.text.includes("7731"))).toBe(true);
  }, 300_000);

  it("does nothing, quietly, when the queue is empty", async () => {
    const result = await processPendingDocuments();
    expect(result.claimed).toBe(0);
    expect(result.errors).toEqual([]);
  }, 60_000);

  it("keeps a small document inline, so the common case still feels instant", async () => {
    const small = await ingestText({
      workspaceId,
      knowledgeBaseId,
      title: "One pager",
      text: "# Hours\n\nThe office opens at nine and closes at five.",
    });

    expect(small.status).toBe("ready");
    expect(small.chunkCount).toBeGreaterThan(0);
  }, 180_000);
});

if (!hasEnv) {
  describe("queued indexing", () => {
    it.skip("skipped: MONGODB_URI or OPENAI_API_KEY is not set", () => {});
  });
}
