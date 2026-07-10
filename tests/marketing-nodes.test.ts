import { describe, it, expect } from "vitest";
import { ImageNodeHandler } from "@/lib/nodes/image";
import { BrandNodeHandler } from "@/lib/nodes/brand";
import { EmailNodeHandler } from "@/lib/nodes/email";
import { parseAssetId } from "@/lib/assets/store";
import { SIZE_BY_MODEL, QUALITY_BY_MODEL } from "@/lib/providers/images";

/**
 * The marketing steps' fail-closed edges and config validation. Nothing here
 * touches the network or the database: every path tested stops before the
 * lazy imports, which is exactly the property being verified.
 */

const image = new ImageNodeHandler();
const brand = new BrandNodeHandler();
const email = new EmailNodeHandler();

const ctx = (config: Record<string, unknown>, inputs: Record<string, unknown> = {}, userId?: string) => ({
  nodeId: "n1",
  inputs,
  config,
  globalContext: {},
  userId,
});

describe("picture step", () => {
  it("fails closed without a run owner", async () => {
    const result = await image.execute(ctx({ promptTemplate: "a red circle" }, {}));
    expect(result.success).toBe(false);
    expect(result.error).toContain("no owner");
  });

  it("refuses a prompt that is nothing but unresolved placeholders", async () => {
    const result = await image.execute(ctx({ promptTemplate: "{{missing}}" }, {}, "u1"));
    expect(result.success).toBe(false);
    expect(result.error).toContain("{{placeholders}}");
  });

  it("validates the frozen vocabulary values", () => {
    expect(image.validateConfig({ promptTemplate: "x" }).valid).toBe(true);
    expect(image.validateConfig({}).valid).toBe(false);
    expect(image.validateConfig({ promptTemplate: "x", size: "huge" }).valid).toBe(false);
    expect(image.validateConfig({ promptTemplate: "x", quality: "ultra" }).valid).toBe(false);
    expect(image.validateConfig({ promptTemplate: "x", background: "green" }).valid).toBe(false);
    expect(
      image.validateConfig({ promptTemplate: "x", size: "tall", quality: "best", background: "transparent" }).valid
    ).toBe(true);
  });
});

describe("brand kit step", () => {
  it("fails closed without a run owner", async () => {
    const result = await brand.execute(ctx({}, { assetId: "abc" }));
    expect(result.success).toBe(false);
    expect(result.error).toContain("no owner");
  });

  it("explains a missing source in plain words", async () => {
    const result = await brand.execute(ctx({}, {}, "u1"));
    expect(result.success).toBe(false);
    expect(result.error).toContain("Connect a picture step");
  });
});

describe("email step", () => {
  it("fails closed without a run owner", async () => {
    const result = await email.execute(
      ctx({ subjectTemplate: "s", bodyTemplate: "b" }, {})
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("no owner");
  });

  it("refuses to assemble without a subject and body", async () => {
    const result = await email.execute(
      ctx({ subjectTemplate: "{{gone}}", bodyTemplate: "{{gone}}" }, {}, "u1")
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("subject and body");
  });

  it("validates config the same way", () => {
    expect(email.validateConfig({ subjectTemplate: "s", bodyTemplate: "b" }).valid).toBe(true);
    expect(email.validateConfig({ subjectTemplate: "s" }).valid).toBe(false);
    expect(
      email.validateConfig({ subjectTemplate: "s", bodyTemplate: "b", layout: "poster" }).valid
    ).toBe(false);
  });
});

describe("asset references", () => {
  const id = "01234567-89ab-4cde-8f01-23456789abcd";

  it("parses a bare id, a url, and a url with extension", () => {
    expect(parseAssetId(id)).toBe(id);
    expect(parseAssetId(`/api/assets/${id}`)).toBe(id);
    expect(parseAssetId(`/api/assets/${id}.png`)).toBe(id);
  });

  it("rejects everything else", () => {
    expect(parseAssetId("")).toBeNull();
    expect(parseAssetId("{{assetId}}")).toBeNull();
    expect(parseAssetId("https://evil.example/x.png")).toBeNull();
  });
});

describe("image size and quality mapping", () => {
  it("maps every plain-language value for both models", () => {
    for (const model of ["gpt-image-1", "dall-e-3"] as const) {
      for (const size of ["square", "wide", "tall"] as const) {
        expect(SIZE_BY_MODEL[model][size]).toMatch(/^\d+x\d+$/);
      }
      for (const quality of ["draft", "standard", "best"] as const) {
        expect(QUALITY_BY_MODEL[model][quality]).toBeTruthy();
      }
    }
  });

  it("wide and tall are transposes of each other", () => {
    for (const model of ["gpt-image-1", "dall-e-3"] as const) {
      const wide = SIZE_BY_MODEL[model].wide.split("x").map(Number);
      const tall = SIZE_BY_MODEL[model].tall.split("x").map(Number);
      expect(wide[0]).toBe(tall[1]);
      expect(wide[1]).toBe(tall[0]);
    }
  });
});
