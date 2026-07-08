/**
 * Colour maths for the brand kit: sRGB to OKLCH and back, WCAG contrast, and
 * palette derivation.
 *
 * OKLCH rather than HSL because it is perceptually uniform: one step of
 * lightness is the same visual step at every hue, so a palette derived by
 * stepping L looks deliberate whether the base colour is yellow or navy. HSL
 * lightness lies about yellow.
 *
 * Everything here is pure functions over numbers and hex strings, so the whole
 * file is testable without an image, a database, or sharp.
 */

export interface Oklch {
  /** Lightness, 0 to 1. */
  l: number;
  /** Chroma, 0 upwards; sRGB tops out around 0.32. */
  c: number;
  /** Hue in degrees, 0 to 360. */
  h: number;
}

/** "#a1b2c3" (any case, with or without the hash) to [r, g, b] in 0..255. */
export function parseHex(hex: string): [number, number, number] | null {
  const match = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return c * 255;
};

/** Björn Ottosson's OKLab, via the published matrices. */
export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.sqrt(a * a + bb * bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return toHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(bl));
}

/** WCAG 2.x relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * White or near-black, whichever reads better on the given background. The
 * question every button asks.
 */
export function readableTextOn(background: string): string {
  return contrastRatio("#ffffff", background) >= contrastRatio("#1a1a1a", background)
    ? "#ffffff"
    : "#1a1a1a";
}

/**
 * Nudge a background's lightness away from its text colour until the pair
 * passes the given contrast ratio. Hue and chroma are kept, so the colour
 * stays recognisably the brand's; only how deep it is moves. Gives up after
 * enough steps to have crossed the whole lightness range, at which point the
 * caller gets the closest the hue allows.
 */
export function ensureContrast(
  text: string,
  background: string,
  ratio = 4.5
): string {
  let bg = hexToOklch(background);
  if (!bg) return background;

  const darkText = relativeLuminance(text) < 0.5;
  const step = darkText ? 0.04 : -0.04;

  for (let i = 0; i < 25; i++) {
    if (contrastRatio(text, oklchToHex(bg)) >= ratio) break;
    bg = { ...bg, l: Math.max(0.05, Math.min(0.98, bg.l + step)) };
  }

  return oklchToHex(bg);
}

export interface BrandPalette {
  /** The brand colour, tamed into a usable range. */
  primary: string;
  /** For hover states and depth. */
  primaryDark: string;
  /** For tinted backgrounds behind the primary. */
  primaryLight: string;
  /** Body text: near-black pulled slightly toward the brand hue. */
  ink: string;
  /** Page background: near-white pulled slightly toward the brand hue. */
  paper: string;
  /** A second voice, 60 degrees around the wheel. */
  accent: string;
  /** Text that sits on primary; guaranteed AA against it. */
  onPrimary: string;
}

/**
 * A full working palette from one colour.
 *
 * The tokens are derived, not picked: lightness steps in OKLCH with the hue
 * held, so every derived colour is visibly kin to the base. The one judgement
 * call is the AA guard at the end: if neither white nor near-black reads on
 * the primary at 4.5:1, the primary itself is deepened until white does,
 * because a brand colour nobody can put a button on is not a usable primary.
 */
export function deriveBrandPalette(baseHex: string): BrandPalette | null {
  const base = hexToOklch(baseHex);
  if (!base) return null;

  // A base that is nearly white or nearly black carries no usable hue
  // decision, so it gets a dignified neutral treatment instead of a washed-out
  // derivation pretending otherwise.
  const isNeutral = base.c < 0.02;
  const hue = isNeutral ? 250 : base.h;
  const chroma = isNeutral ? 0.03 : Math.min(base.c, 0.24);

  let primary: Oklch = {
    l: Math.max(0.38, Math.min(0.72, base.l)),
    c: chroma,
    h: hue,
  };

  // The AA guard. Deepen until white text passes; see the doc comment.
  while (
    contrastRatio(readableTextOn(oklchToHex(primary)), oklchToHex(primary)) < 4.5 &&
    primary.l > 0.2
  ) {
    primary = { ...primary, l: primary.l - 0.03 };
  }

  const primaryHex = oklchToHex(primary);

  return {
    primary: primaryHex,
    primaryDark: oklchToHex({ ...primary, l: Math.max(0.22, primary.l - 0.15) }),
    primaryLight: oklchToHex({
      l: 0.94,
      c: Math.min(chroma * 0.35, 0.06),
      h: hue,
    }),
    ink: oklchToHex({ l: 0.26, c: 0.02, h: hue }),
    paper: oklchToHex({ l: 0.98, c: 0.006, h: hue }),
    accent: oklchToHex({
      l: 0.62,
      c: Math.max(0.08, chroma * 0.7),
      h: (hue + 60) % 360,
    }),
    onPrimary: readableTextOn(primaryHex),
  };
}

/**
 * The dominant brand colour in a decoded RGBA pixel buffer.
 *
 * Pixels are bucketed on a 32-step grid and counted; transparent and
 * near-white pixels are ignored because a logo's silence (its background and
 * anti-aliasing halo) would otherwise outvote its voice. Saturation weights
 * the count, so a logo that is 70% black mark and 30% coloured accent still
 * hands back the accent, which is what a person means by "the brand colour".
 */
export function dominantColor(
  rgba: Uint8Array | Buffer,
  opts: { minAlpha?: number } = {}
): string | null {
  const minAlpha = opts.minAlpha ?? 128;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < minAlpha) continue;

    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (r > 240 && g > 240 && b > 240) continue;

    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  let best: { score: number; hex: string } | null = null;

  for (const bucket of buckets.values()) {
    const r = bucket.r / bucket.count;
    const g = bucket.g / bucket.count;
    const b = bucket.b / bucket.count;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    const score = bucket.count * (1 + saturation * 3);
    if (!best || score > best.score) {
      best = { score, hex: toHex(r, g, b) };
    }
  }

  return best?.hex ?? null;
}
