/**
 * Image generation, one function.
 *
 * gpt-image-1 first, because it is the only model that can hand back a
 * transparent background, which the brand kit's mockup compositing depends
 * on. If the account lacks access (it is gated behind org verification),
 * dall-e-3 takes over: no transparency, but the compositor blends with
 * multiply, and white times the scene is the scene, so a white-background
 * logo still mocks up correctly. The degradation is designed, not an
 * accident.
 *
 * The same discipline as the text provider layer: 401, 403, 429 and quota
 * errors are never retried against the other model, because a bad key is bad
 * for both and retrying it just costs money and delays the error.
 */
import OpenAI from "openai";

/** Stored config values. Frozen: they persist inside saved workflows. */
export type ImageSize = "square" | "wide" | "tall";
export type ImageQuality = "draft" | "standard" | "best";
export type ImageBackground = "auto" | "transparent";

export interface GenerateImageOptions {
  prompt: string;
  size?: ImageSize;
  quality?: ImageQuality;
  background?: ImageBackground;
}

export interface GeneratedImage {
  data: Buffer;
  contentType: "image/png";
  /** Which model actually produced it, for the asset record. */
  model: "gpt-image-1" | "dall-e-3";
}

/**
 * The two models disagree on pixel sizes, so the plain-language size maps per
 * model. Exported for tests: a wrong mapping fails at the provider with an
 * error about dimensions, which reads like a broken product.
 */
export const SIZE_BY_MODEL: Record<"gpt-image-1" | "dall-e-3", Record<ImageSize, string>> = {
  "gpt-image-1": { square: "1024x1024", wide: "1536x1024", tall: "1024x1536" },
  "dall-e-3": { square: "1024x1024", wide: "1792x1024", tall: "1024x1792" },
};

/** draft/standard/best in each model's own vocabulary. */
export const QUALITY_BY_MODEL: Record<"gpt-image-1" | "dall-e-3", Record<ImageQuality, string>> = {
  "gpt-image-1": { draft: "low", standard: "medium", best: "high" },
  "dall-e-3": { draft: "standard", standard: "standard", best: "hd" },
};

/** Errors that mean "this key/model cannot work", where a fallback is pointless. */
function isTerminal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /401|403|429|api key|quota|billing|rate limit/i.test(message);
}

/** Errors that mean "this model, not this key": the fallback is worth trying. */
function isModelUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /model|verified|verification|not found|404|access|unsupported/i.test(message);
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Test seam. */
export function setImageClient(next: OpenAI | null): void {
  client = next;
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GeneratedImage> {
  const size = options.size ?? "square";
  const quality = options.quality ?? "standard";

  try {
    return await callModel("gpt-image-1", options.prompt, size, quality, options.background);
  } catch (error) {
    if (isTerminal(error) || !isModelUnavailable(error)) throw error;
    // Transparency was the one thing only gpt-image-1 could do; everything
    // else the fallback covers.
    return await callModel("dall-e-3", options.prompt, size, quality, undefined);
  }
}

async function callModel(
  model: "gpt-image-1" | "dall-e-3",
  prompt: string,
  size: ImageSize,
  quality: ImageQuality,
  background: ImageBackground | undefined
): Promise<GeneratedImage> {
  // The installed SDK's types predate gpt-image-1's parameters (background,
  // low/medium/high quality). The API accepts them; only the types object.
  const params: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size: SIZE_BY_MODEL[model][size],
    quality: QUALITY_BY_MODEL[model][quality],
  };

  if (model === "gpt-image-1") {
    if (background === "transparent") params.background = "transparent";
  } else {
    // gpt-image-1 answers b64 by default; dall-e-3 must be asked.
    params.response_format = "b64_json";
  }

  const response = await getClient().images.generate(
    params as unknown as OpenAI.ImageGenerateParams
  );

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("The image service returned no image data");
  }

  return {
    data: Buffer.from(b64, "base64"),
    contentType: "image/png",
    model,
  };
}
