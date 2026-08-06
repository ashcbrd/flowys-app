import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { executeNode } from "@/lib/nodes";
import { ingestText, deleteDocument, getOrCreateDefaultKnowledgeBase } from "@/lib/knowledge/ingest";
import { getOrCreatePersonalWorkspace } from "@/lib/workspaces/service";
import { connectToDatabase, User, Workspace, Membership, KnowledgeBase, KnowledgeDocument, Chunk } from "@/lib/db";

/**
 * The retrieval step, end to end and unmocked: a real user's real document is
 * ingested through the real pipeline, then the step runs exactly as the engine
 * runs it and has to hand back the passage that answers the question.
 *
 * This is the live test the CLAUDE.md four-things rule requires for a new step
 * type, and it is the only test that can catch the failure the whole feature
 * is prone to: every layer succeeding while retrieval returns nothing.
 */

const hasEnv = !!process.env.MONGODB_URI && !!process.env.OPENAI_API_KEY;
const live = hasEnv ? describe : describe.skip;

live("retrieval node, against real ingestion and search", () => {
  const userId = `test-user-${uuid()}`;
  let workspaceId: string;
  let documentId: string;

  beforeAll(async () => {
    await connectToDatabase();
    await User.create({
      _id: userId,
      email: `${userId}@example.com`,
      passwordHash: "scrypt$00$00",
    });
    workspaceId = await getOrCreatePersonalWorkspace(userId);
    const kb = await getOrCreateDefaultKnowledgeBase(workspaceId);

    const result = await ingestText({
      workspaceId,
      knowledgeBaseId: kb,
      title: "Returns policy",
      text: [
        "# Returns",
        "",
        "Items can be returned within forty five days with the original receipt.",
        "",
        "# Contact",
        "",
        "The support desk answers within one working day.",
      ].join("\n"),
    });
    expect(result.status).toBe("ready");
    documentId = result.documentId;
  }, 180_000);

  afterAll(async () => {
    if (workspaceId && documentId) await deleteDocument(workspaceId, documentId);
    await Chunk.deleteMany({ workspaceId });
    await KnowledgeDocument.deleteMany({ workspaceId });
    await KnowledgeBase.deleteMany({ workspaceId });
    await Membership.deleteMany({ userId });
    await Workspace.deleteMany({ ownerUserId: userId });
    await User.deleteMany({ _id: userId });
  }, 60_000);

  it("finds the passage that answers an interpolated question", async () => {
    const result = await executeNode("retrieval", {
      nodeId: "n1",
      inputs: {},
      config: { queryTemplate: "How long do I have to send {{item}} back?", topK: 3 },
      globalContext: { item: "a jacket" },
      userId,
    });

    expect(result.success).toBe(true);
    const output = result.output!;
    expect(output.found).toBeGreaterThan(0);
    expect(String(output.context)).toContain("forty five days");

    const citations = output.citations as { document: string; section: string | null }[];
    expect(citations[0].document).toBe("Returns policy");
    expect(citations[0].section).toBe("Returns");
  }, 120_000);

  it("fails closed when the run has no owner", async () => {
    const result = await executeNode("retrieval", {
      nodeId: "n1",
      inputs: {},
      config: { queryTemplate: "anything" },
      globalContext: {},
      // no userId: a misconfigured trigger path must not guess an identity
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/owner/);
  });

  it("reports an empty interpolation instead of searching for nothing", async () => {
    const result = await executeNode("retrieval", {
      nodeId: "n1",
      inputs: {},
      config: { queryTemplate: "{{missing}}" },
      globalContext: {},
      userId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("returns cleanly for a user with no matching documents", async () => {
    const result = await executeNode("retrieval", {
      nodeId: "n1",
      inputs: {},
      config: { queryTemplate: "quantum blockchain synergy" , topK: 3 },
      globalContext: {},
      userId,
    });

    // Vector search always ranks something if anything is indexed; the point
    // here is that an off-topic query still succeeds with a well-formed shape
    // rather than erroring, and the next step decides what to do with weak
    // passages.
    expect(result.success).toBe(true);
    expect(Array.isArray(result.output!.passages)).toBe(true);
  }, 120_000);
});

if (!hasEnv) {
  describe("retrieval node", () => {
    it.skip("skipped: MONGODB_URI or OPENAI_API_KEY is not set", () => {});
  });
}
