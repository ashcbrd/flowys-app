import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import sharp from "sharp";
import { executeNode } from "@/lib/nodes";
import { connectToDatabase, Asset } from "@/lib/db";
import { saveAsset } from "@/lib/assets/store";

/**
 * The brand kit step end to end against the real database: a real logo PNG
 * goes in through the real asset store, and the step has to hand back a board
 * whose every image reference resolves to stored bytes. No model call is
 * involved; the step is deterministic, which is its selling point.
 */

const hasEnv = !!process.env.MONGODB_URI;
const live = hasEnv ? describe : describe.skip;

live("brand kit step, against real storage and compositing", () => {
  const userId = `test-user-${uuid()}`;
  let logoAssetId: string;

  beforeAll(async () => {
    await connectToDatabase();
    const logo = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 20, g: 110, b: 90, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const saved = await saveAsset({ userId, kind: "image", contentType: "image/png", data: logo });
    logoAssetId = saved.id;
  });

  afterAll(async () => {
    await Asset.deleteMany({ userId });
  });

  it("builds mockups, a palette, and a board whose images all exist", async () => {
    const result = await executeNode("brand", {
      nodeId: "live-brand",
      inputs: { assetId: logoAssetId, businessName: "Live Test Coffee" },
      config: {
        sourceTemplate: "{{assetId}}",
        businessNameTemplate: "{{businessName}}",
        taglineTemplate: "brewed by a test",
      },
      globalContext: {},
      userId,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    expect(result.output?.mockupCount).toBe(5);
    expect(result.output?.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(result.output?.paletteHexes).toHaveLength(5);

    const board = result.output?.boardMarkdown as string;
    expect(board).toContain("# Live Test Coffee");
    expect(board).toContain("*brewed by a test*");

    // Every image the board references is really in the database.
    const refs = [...board.matchAll(/\]\(\/api\/assets\/([0-9a-f-]{36})\.png\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(7); // logo + strip + five mockups
    for (const id of refs) {
      const asset = await Asset.findById(id).select({ bytes: 1, userId: 1 });
      expect(asset, id).not.toBeNull();
      expect(asset!.userId).toBe(userId);
      expect(asset!.bytes).toBeGreaterThan(0);
    }
  }, 60_000);

  it("refuses another user's asset", async () => {
    const result = await executeNode("brand", {
      nodeId: "live-brand-2",
      inputs: { assetId: logoAssetId },
      config: { sourceTemplate: "{{assetId}}" },
      globalContext: {},
      userId: `someone-else-${uuid()}`,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("could not be found");
  });
});
