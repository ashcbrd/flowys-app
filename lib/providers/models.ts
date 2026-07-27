/**
 * Model Catalog
 *
 * The models a workflow may use, with plain-language labels.
 *
 * Model IDs are load-bearing: a retired or misspelled ID fails at run time with
 * a 404 that reads like a broken workflow rather than a bad setting. Keeping the
 * list here, instead of a free-text box and a default buried in a provider,
 * means the UI can only offer IDs that exist, and there is one place to update
 * when a model is retired.
 *
 * Note: `claude-sonnet-4-20250514` was the previous default and retired
 * 2026-06-15. Do not reintroduce dated Claude aliases; current IDs carry no date
 * suffix.
 */

export type ProviderId = "anthropic" | "openai";

export interface ModelOption {
  /** Sent to the provider. Must be an exact, current model ID. */
  id: string;
  /** What the user reads. */
  label: string;
  /** One line on when to pick this. */
  help: string;
  provider: ProviderId;
}

export const MODELS: ModelOption[] = [
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    help: "Most capable. Best for careful reasoning and messy input.",
    provider: "anthropic",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    help: "Balanced speed and quality. A good default for most steps.",
    provider: "anthropic",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    help: "Fastest and cheapest. Good for simple sorting or labelling.",
    provider: "anthropic",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    help: "Capable general-purpose model.",
    provider: "openai",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    help: "Faster and cheaper. Good for simple steps.",
    provider: "openai",
  },
];

/**
 * The one provider this deployment is configured for.
 *
 * Only an OpenAI key is provisioned, so a workflow step does not choose a
 * provider or a model, offering the choice would only let a user select
 * something that cannot run. The UI therefore asks nothing about this, and
 * `resolveAiTarget` is the single place that decides.
 *
 * To offer the choice again: provision the other key, and reinstate the picker
 * from `MODELS` (still exported below for that purpose).
 */
export const FIXED_PROVIDER: ProviderId = "openai";
export const FIXED_MODEL = "gpt-4o-mini";

/**
 * What an AI step should actually call, whatever its stored config says.
 *
 * Saved workflows carry a provider and model from when the choice existed,
 * including retired Anthropic models that would 404 and Anthropic steps that
 * have no key. Overriding them is what keeps those workflows running.
 */
export function resolveAiTarget(): { provider: ProviderId; model: string } {
  return { provider: FIXED_PROVIDER, model: FIXED_MODEL };
}

/** The model used when a step doesn't name one. */
export const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-4o",
};

export function modelsFor(provider: string | undefined): ModelOption[] {
  if (!provider) return MODELS;
  return MODELS.filter((m) => m.provider === provider);
}

export function isKnownModel(id: string | undefined): boolean {
  if (!id) return false;
  return MODELS.some((m) => m.id === id);
}

export function modelLabel(id: string | undefined): string {
  if (!id) return "";
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

/**
 * Retired IDs mapped to their replacement, so a saved workflow keeps running
 * instead of failing with a 404 the user can't diagnose.
 */
export const RETIRED_MODELS: Record<string, string> = {
  "claude-sonnet-4-20250514": "claude-sonnet-5",
  "claude-sonnet-4-0": "claude-sonnet-5",
  "claude-3-7-sonnet-20250219": "claude-sonnet-5",
  "claude-3-5-sonnet-20241022": "claude-sonnet-5",
  "claude-3-5-sonnet-20240620": "claude-sonnet-5",
  "claude-3-opus-20240229": "claude-opus-5",
  "claude-opus-4-20250514": "claude-opus-5",
  "claude-opus-4-0": "claude-opus-5",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "claude-3-haiku-20240307": "claude-haiku-4-5",
};

/** Swap a retired ID for its current replacement. Returns the ID unchanged otherwise. */
export function resolveModel(
  id: string | undefined,
  provider: ProviderId
): string {
  if (!id) return DEFAULT_MODEL[provider];
  return RETIRED_MODELS[id] ?? id;
}
