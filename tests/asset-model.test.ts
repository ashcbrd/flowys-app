import { describe, it, expect } from "vitest";
import { Asset } from "@/lib/db/models/Asset";

describe("Asset model", () => {
  it("requires an owner, a kind, a content type, bytes and data", () => {
    const err = new Asset({}).validateSync();
    expect(err?.errors.userId).toBeDefined();
    expect(err?.errors.kind).toBeDefined();
    expect(err?.errors.contentType).toBeDefined();
    expect(err?.errors.data).toBeDefined();
    expect(err?.errors.bytes).toBeDefined();
  });

  it("accepts an image asset and generates a uuid id", () => {
    const asset = new Asset({
      userId: "u1",
      kind: "image",
      contentType: "image/png",
      data: Buffer.from([1, 2, 3]),
      bytes: 3,
      prompt: "a red circle",
      model: "gpt-image-1",
    });
    expect(asset.validateSync()).toBeUndefined();
    expect(asset._id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a kind outside the vocabulary", () => {
    const asset = new Asset({
      userId: "u1",
      kind: "video",
      contentType: "video/mp4",
      data: Buffer.from([1]),
      bytes: 1,
    });
    expect(asset.validateSync()?.errors.kind).toBeDefined();
  });
});
