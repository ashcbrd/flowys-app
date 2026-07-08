import { describe, it, expect } from "vitest";
import {
  parseHex,
  toHex,
  hexToOklch,
  oklchToHex,
  contrastRatio,
  readableTextOn,
  ensureContrast,
  deriveBrandPalette,
  dominantColor,
} from "@/lib/brand/color";

describe("hex parsing", () => {
  it("accepts both cases and an optional hash", () => {
    expect(parseHex("#A1B2C3")).toEqual([161, 178, 195]);
    expect(parseHex("a1b2c3")).toEqual([161, 178, 195]);
  });

  it("rejects shorthand, names, and junk", () => {
    expect(parseHex("#abc")).toBeNull();
    expect(parseHex("tomato")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("OKLCH round trip", () => {
  it.each(["#ff0000", "#00ff00", "#0000ff", "#1a73e8", "#c2185b", "#333333"])(
    "%s survives hex -> oklch -> hex within one step per channel",
    (hex) => {
      const back = oklchToHex(hexToOklch(hex)!);
      const [r1, g1, b1] = parseHex(hex)!;
      const [r2, g2, b2] = parseHex(back)!;
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1);
    }
  );

  it("orders lightness the way eyes do", () => {
    expect(hexToOklch("#ffffff")!.l).toBeGreaterThan(hexToOklch("#888888")!.l);
    expect(hexToOklch("#888888")!.l).toBeGreaterThan(hexToOklch("#000000")!.l);
  });
});

describe("contrast", () => {
  it("black on white is 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1a73e8", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1a73e8"),
      5
    );
  });

  it("picks white text on dark and dark text on light", () => {
    expect(readableTextOn("#0b1120")).toBe("#ffffff");
    expect(readableTextOn("#ffee88")).toBe("#1a1a1a");
  });

  it("ensureContrast pushes a background until the pair passes", () => {
    // Mid-grey against white text starts well under 4.5.
    expect(contrastRatio("#ffffff", "#999999")).toBeLessThan(4.5);
    const fixed = ensureContrast("#ffffff", "#999999");
    expect(contrastRatio("#ffffff", fixed)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("palette derivation", () => {
  it("every palette guarantees AA on its own button", () => {
    for (const base of ["#1a73e8", "#ffee00", "#ff00ff", "#004400", "#e8e8e8"]) {
      const palette = deriveBrandPalette(base)!;
      expect(
        contrastRatio(palette.onPrimary, palette.primary),
        `base ${base}`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the hue family: a blue base derives a blue primary", () => {
    const palette = deriveBrandPalette("#1a73e8")!;
    const [r, , b] = parseHex(palette.primary)!;
    expect(b).toBeGreaterThan(r);
  });

  it("dark is darker and light is lighter than primary", () => {
    const palette = deriveBrandPalette("#c2185b")!;
    expect(hexToOklch(palette.primaryDark)!.l).toBeLessThan(hexToOklch(palette.primary)!.l);
    expect(hexToOklch(palette.primaryLight)!.l).toBeGreaterThan(hexToOklch(palette.primary)!.l);
  });

  it("rejects what parseHex rejects", () => {
    expect(deriveBrandPalette("blue")).toBeNull();
  });
});

describe("dominant colour", () => {
  /** A tiny raw RGBA buffer built by hand. */
  function pixels(...px: [number, number, number, number][]): Buffer {
    return Buffer.from(px.flat());
  }

  it("ignores transparent and near-white pixels", () => {
    const rgba = pixels(
      [255, 255, 255, 255], // near-white: out
      [200, 30, 40, 10], // transparent: out
      [200, 30, 40, 255],
      [200, 30, 40, 255]
    );
    expect(dominantColor(rgba)).toBe(toHex(200, 30, 40));
  });

  it("prefers a saturated accent over a larger grey mass", () => {
    const grey: [number, number, number, number] = [80, 80, 80, 255];
    const red: [number, number, number, number] = [220, 20, 40, 255];
    // Twice as much grey as red; saturation weighting should still pick red.
    const rgba = pixels(grey, grey, grey, grey, red, red);
    expect(dominantColor(rgba)).toBe(toHex(220, 20, 40));
  });

  it("returns null when nothing counts", () => {
    expect(dominantColor(pixels([255, 255, 255, 255]))).toBeNull();
  });
});
