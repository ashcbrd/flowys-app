import { describe, expect, it } from "vitest";
import {
  MODELS,
  DEFAULT_MODEL,
  RETIRED_MODELS,
  isKnownModel,
  modelsFor,
  modelLabel,
  resolveModel,
} from "@/lib/providers/models";

/**
 * Model IDs are load-bearing: a retired or invented one fails at run time with a
 * 404 that reads like a broken workflow. The app shipped for six weeks with a
 * default that had already been withdrawn, so these are pinned.
 */

describe("catalog", () => {
  it("has no duplicate ids", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries no dated Claude aliases", () => {
    // Current Claude IDs have no date suffix; a dated one is a retired snapshot.
    for (const model of MODELS) {
      if (!model.id.startsWith("claude")) continue;
      expect(model.id, `${model.id} looks like a dated snapshot`).not.toMatch(
        /-\d{8}$/
      );
    }
  });

  it("gives every model a label and a help line", () => {
    for (const model of MODELS) {
      expect(model.label.length).toBeGreaterThan(0);
      expect(model.help.length).toBeGreaterThan(0);
    }
  });

  it("has a default per provider that exists in the catalog", () => {
    for (const [provider, id] of Object.entries(DEFAULT_MODEL)) {
      expect(isKnownModel(id), `${provider} default ${id} is not in the catalog`).toBe(
        true
      );
      expect(MODELS.find((m) => m.id === id)?.provider).toBe(provider);
    }
  });

  it("defaults Anthropic to Opus 5", () => {
    expect(DEFAULT_MODEL.anthropic).toBe("claude-opus-5");
  });
});

describe("fixed AI target", () => {
  it("resolves to a provider and model that exist in the catalog", async () => {
    const { resolveAiTarget } = await import("@/lib/providers/models");
    const target = resolveAiTarget();
    expect(isKnownModel(target.model)).toBe(true);
    expect(MODELS.find((m) => m.id === target.model)?.provider).toBe(target.provider);
  });

  it("ignores whatever a saved step stored", async () => {
    // A step saved when the choice existed may name a retired Anthropic model
    // with no key behind it; overriding is what keeps it running.
    const { resolveAiTarget, FIXED_PROVIDER } = await import("@/lib/providers/models");
    expect(resolveAiTarget().provider).toBe(FIXED_PROVIDER);
  });
});

describe("retired model handling", () => {
  it("maps the default that shipped broken", () => {
    // This was the default in lib/providers/anthropic.ts and retired 2026-06-15.
    expect(resolveModel("claude-sonnet-4-20250514", "anthropic")).toBe(
      "claude-sonnet-5"
    );
  });

  it("maps every retired id to something that currently exists", () => {
    for (const [retired, replacement] of Object.entries(RETIRED_MODELS)) {
      expect(
        isKnownModel(replacement),
        `${retired} maps to ${replacement}, which is not in the catalog`
      ).toBe(true);
    }
  });

  it("never lists a retired id as available", () => {
    for (const retired of Object.keys(RETIRED_MODELS)) {
      expect(isKnownModel(retired), `${retired} is still offered`).toBe(false);
    }
  });

  it("falls back to the provider default when no model is set", () => {
    expect(resolveModel(undefined, "anthropic")).toBe(DEFAULT_MODEL.anthropic);
    expect(resolveModel(undefined, "openai")).toBe(DEFAULT_MODEL.openai);
  });

  it("passes a current id through untouched", () => {
    expect(resolveModel("claude-opus-5", "anthropic")).toBe("claude-opus-5");
  });
});

describe("filtering and labelling", () => {
  it("only offers a provider its own models", () => {
    for (const model of modelsFor("anthropic")) {
      expect(model.provider).toBe("anthropic");
    }
    for (const model of modelsFor("openai")) {
      expect(model.provider).toBe("openai");
    }
  });

  it("offers every model when no provider is given", () => {
    expect(modelsFor(undefined)).toHaveLength(MODELS.length);
  });

  it("falls back to the raw id when labelling something unknown", () => {
    expect(modelLabel("some-future-model")).toBe("some-future-model");
    expect(modelLabel(undefined)).toBe("");
  });
});

describe("regression: OpenAI structured-output schema", () => {
  it("fills in items for a list so the request is not rejected", async () => {
    // A "List of items" output declared in the node editor has no `items`, which
    // OpenAI rejects outright with a 400 before the model is ever called.
    const { OpenAIProvider } = await import("@/lib/providers/openai");
    const provider = new OpenAIProvider("sk-not-called");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalize = (provider as any).normalizeSchemaForOpenAI.bind(provider);

    const normalized = normalize({
      type: "object",
      properties: { topics: { type: "array", description: "themes" } },
      required: ["topics"],
    });

    expect(normalized.properties.topics.items).toEqual({ type: "string" });
    expect(normalized.additionalProperties).toBe(false);
  });

  it("declines strict mode for an object with no declared fields", async () => {
    const { OpenAIProvider } = await import("@/lib/providers/openai");
    const provider = new OpenAIProvider("sk-not-called");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canUse = (provider as any).canUseStrictSchema.bind(provider);

    expect(canUse({ type: "object", properties: { a: { type: "string" } } })).toBe(true);
    expect(canUse({ type: "object", properties: {} })).toBe(false);
    expect(
      canUse({ type: "object", properties: { g: { type: "object", properties: {} } } })
    ).toBe(false);
  });
});
