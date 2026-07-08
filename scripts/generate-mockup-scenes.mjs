/**
 * Generates the five mockup base scenes the brand kit step composites onto.
 *
 * Run once, commit the PNGs. The scenes are build-time assets, not runtime
 * generation: the whole point of the mockup pipeline is that a run pays for
 * one logo generation and gets every mockup for free, with the logo
 * pixel-identical in each. Regenerating scenes changes the placement zones in
 * lib/brand/mockups.ts, so if you re-run this, re-check those against the new
 * images before shipping.
 *
 * Usage: node scripts/generate-mockup-scenes.mjs [--only bottle,cup]
 * Reads OPENAI_API_KEY from .env. Tries gpt-image-1, falls back to dall-e-3.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env reader; no dependency needed for a one-off script.
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const apiKey = env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY missing from .env");
  process.exit(1);
}

/**
 * Every prompt asks for a straight-on, blank-surfaced scene, because the
 * compositor places the logo with a flat affine transform. An angled bottle
 * would need a perspective warp the pipeline deliberately does not have.
 */
const SCENES = [
  {
    name: "bottle",
    prompt:
      "Studio product photograph of a plain glass beverage bottle with a completely blank matte white label wrapped around its middle, bottle centered and photographed straight on at eye level, soft daylight, seamless light grey background, no text, no logos, no other objects",
  },
  {
    name: "cup",
    prompt:
      "Studio product photograph of a plain white paper coffee cup with a white lid, completely blank surface, cup centered and photographed straight on, soft shadows, seamless warm neutral background, no text, no logos, no other objects",
  },
  {
    name: "tote",
    prompt:
      "Studio product photograph of a plain natural beige canvas tote bag hanging flat against a white wall, completely blank front panel facing the camera, photographed straight on, soft daylight, no text, no logos, no other objects",
  },
  {
    name: "card",
    prompt:
      "Studio photograph of a single blank white business card lying flat on a light oak desk, photographed directly from above, soft natural shadow, no text, no logos, no other objects",
  },
  {
    name: "storefront",
    prompt:
      "Photograph of a small modern shop storefront with a completely blank flat white rectangular sign board mounted above the window, photographed straight on from street level, daylight, no text, no logos, no people",
  },
];

async function generate(prompt) {
  // gpt-image-1 first: better scene coherence and a b64 response by default.
  let res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality: "medium" }),
  });

  if (res.status === 403 || res.status === 404 || res.status === 400) {
    const detail = (await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`;
    console.warn(`gpt-image-1 unavailable (${detail}); falling back to dall-e-3`);
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "dall-e-3", prompt, size: "1024x1024", response_format: "b64_json" }),
    });
  }

  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }

  const body = await res.json();
  return Buffer.from(body.data[0].b64_json, "base64");
}

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1].split(",")
  : null;

mkdirSync(resolve(root, "public/mockups"), { recursive: true });

for (const scene of SCENES) {
  if (only && !only.includes(scene.name)) continue;
  process.stdout.write(`${scene.name}... `);
  const png = await generate(scene.prompt);
  const out = resolve(root, `public/mockups/${scene.name}.png`);
  writeFileSync(out, png);
  console.log(`${(png.length / 1024).toFixed(0)} KB -> public/mockups/${scene.name}.png`);
}
