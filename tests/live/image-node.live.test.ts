import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { executeNode } from "@/lib/nodes";
import { connectToDatabase, Asset } from "@/lib/db";

/**
 * The picture step, unmocked: one real generation at draft quality (cents,
 * not dollars), landing in the real database. This is the live test the
 * CLAUDE.md four-things rule requires for a new step type, and the only test
 * that can catch what mocks never will: a retired model name, a size string
 * the API stopped accepting, a response shape that moved.
 */

const hasEnv = !!process.env.MONGODB_URI && !!process.env.OPENAI_API_KEY;
const live = hasEnv ? describe : describe.skip;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

live("picture step, against the real image API and database", () => {
  const userId = `test-user-${uuid()}`;
  let assetId: string | undefined;

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    if (assetId) await Asset.deleteOne({ _id: assetId });
  });

  it("generates, stores, and hands on a working reference", async () => {
    const result = await executeNode("image", {
      nodeId: "live-image",
      inputs: { thing: "a single red circle" },
      config: {
        promptTemplate: "A flat minimal test image: {{thing}} on a white background",
        size: "square",
        quality: "draft",
      },
      globalContext: {},
      userId,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    assetId = result.output?.assetId as string;
    expect(assetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.output?.imageUrl).toBe(`/api/assets/${assetId}.png`);
    expect(result.output?.imageMarkdown).toContain(`](/api/assets/${assetId}.png)`);

    // The stored bytes are an actual PNG owned by the run owner.
    const asset = await Asset.findById(assetId);
    expect(asset).not.toBeNull();
    expect(asset!.userId).toBe(userId);
    expect(asset!.contentType).toBe("image/png");
    expect(asset!.bytes).toBeGreaterThan(1000);
    expect(asset!.data.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  }, 120_000);
});
