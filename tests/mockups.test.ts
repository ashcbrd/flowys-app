import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ZONES, KIND_SCENES, normalizeKind, composeMockups, extractLogoColor, paletteStripPng } from "@/lib/brand/mockups";
import { buildBoardMarkdown } from "@/lib/brand/board";
import { deriveBrandPalette } from "@/lib/brand/color";

/**
 * The deterministic half of the brand kit, run for real: sharp compositing
 * against the committed scene photos, colour extraction, and the palette
 * strip. Offline by construction, which is the whole argument for building
 * the mockups this way.
 */

/** A solid test logo made in-process, so the suite carries no fixture file. */
async function testLogo(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe("mockup scenes", () => {
  it("every declared zone has its scene file committed", async () => {
    for (const zone of ZONES) {
      const file = path.join(process.cwd(), "public", "mockups", `${zone.scene}.png`);
      const meta = await sharp(await readFile(file)).metadata();
      expect(meta.width, zone.scene).toBe(1024);
      expect(meta.height, zone.scene).toBe(1024);
      // And the zone actually fits inside the image.
      expect(zone.left + zone.width, zone.scene).toBeLessThanOrEqual(1024);
      expect(zone.top + zone.height, zone.scene).toBeLessThanOrEqual(1024);
    }
  });

  it("every business kind maps to five scenes that exist", () => {
    const known = new Set(ZONES.map((z) => z.scene));
    for (const [kind, scenes] of Object.entries(KIND_SCENES)) {
      expect(scenes, kind).toHaveLength(5);
      for (const scene of scenes) expect(known.has(scene), `${kind}: ${scene}`).toBe(true);
    }
  });

  it("normalizes whatever a model hands back", () => {
    expect(normalizeKind("Construction ")).toBe("construction");
    expect(normalizeKind("beverage company")).toBe("other");
    expect(normalizeKind(undefined)).toBe("other");
  });

  it("composites the kind's scenes at scene size", async () => {
    const logo = await testLogo(200, 30, 40);
    const mockups = await composeMockups(logo, "construction");

    expect(mockups.map((m) => m.title)).toEqual([
      "Van",
      "Site board",
      "Shirt",
      "Business card",
      "Storefront",
    ]);

    for (const mockup of mockups) {
      const meta = await sharp(mockup.png).metadata();
      expect(meta.width).toBe(1024);
      expect(meta.height).toBe(1024);
    }
  });

  it("actually places the logo: the zone's centre pixel takes its colour", async () => {
    const logo = await testLogo(200, 30, 40);
    const [bottle] = await composeMockups(logo, "drink");
    const zone = ZONES[0];

    const { data, info } = await sharp(bottle.png).raw().toBuffer({ resolveWithObject: true });
    const cx = Math.round(zone.left + zone.width / 2);
    const cy = Math.round(zone.top + zone.height / 2);
    const idx = (cy * info.width + cx) * info.channels;

    // Multiply blend over a near-white label keeps red dominant.
    expect(data[idx]).toBeGreaterThan(120);
    expect(data[idx + 1]).toBeLessThan(120);
  });
});

describe("colour extraction", () => {
  it("finds the logo's colour", async () => {
    const logo = await testLogo(20, 120, 200);
    const hex = await extractLogoColor(logo);
    expect(hex).not.toBeNull();
    const [r, g, b] = [hex!.slice(1, 3), hex!.slice(3, 5), hex!.slice(5, 7)].map((h) =>
      parseInt(h, 16)
    );
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });
});

describe("palette strip", () => {
  it("renders one swatch per colour", async () => {
    const png = await paletteStripPng(["#112233", "#445566", "#778899"]);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(200);
  });
});

describe("board assembly", () => {
  it("lays out name, palette table, and every mockup", () => {
    const palette = deriveBrandPalette("#1a73e8")!;
    const board = buildBoardMarkdown({
      businessName: "Kalinaw Coffee",
      tagline: "Slow mornings",
      logoUrl: "/api/assets/x.png",
      palette,
      paletteStripUrl: "/api/assets/strip.png",
      mockups: [
        { title: "Bottle", url: "/api/assets/a.png" },
        { title: "Tote bag", url: "/api/assets/b.png" },
      ],
    });

    expect(board).toContain("# Kalinaw Coffee");
    expect(board).toContain("*Slow mornings*");
    expect(board).toContain(palette.primary.toUpperCase());
    expect(board).toContain("![Bottle](/api/assets/a.png)");
    expect(board).toContain("![Tote bag](/api/assets/b.png)");
    // The honesty line: a concept, not final identity work.
    expect(board).toContain("redrawn as a vector");
  });
});
