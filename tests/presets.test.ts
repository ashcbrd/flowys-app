import { describe, expect, it } from "vitest";
import { API_PRESETS, applyPreset, presetsByCategory } from "@/lib/api-presets";

/**
 * A preset writes an API-step config on the user's behalf. If it puts the secret
 * in the wrong place the request fails with an auth error the user has no way to
 * diagnose, so placement is pinned per preset.
 */

describe("catalog", () => {
  it("has no duplicate ids", () => {
    const ids = API_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tells the user where to get the value it asks for", () => {
    for (const preset of API_PRESETS) {
      expect(preset.whereToGetIt.length, `${preset.id}`).toBeGreaterThan(20);
      expect(preset.secret.label.length, `${preset.id}`).toBeGreaterThan(0);
      expect(preset.secret.placeholder.length, `${preset.id}`).toBeGreaterThan(0);
    }
  });

  it("names a header when the secret goes in a header", () => {
    for (const preset of API_PRESETS) {
      if (preset.secret.target !== "header") continue;
      expect(preset.secret.key, `${preset.id} has no header name`).toBeTruthy();
    }
  });

  it("groups every preset under a category", () => {
    const grouped = presetsByCategory();
    const total = grouped.reduce((sum, [, list]) => sum + list.length, 0);
    expect(total).toBe(API_PRESETS.length);
  });

  it("sends JSON bodies with a matching content type", () => {
    for (const preset of API_PRESETS) {
      if (!preset.config.body) continue;
      expect(
        preset.config.headers?.["Content-Type"],
        `${preset.id} posts a body without declaring JSON`
      ).toBe("application/json");
    }
  });

  it("ships bodies that are valid JSON once tokens are filled", () => {
    for (const preset of API_PRESETS) {
      if (!preset.config.body) continue;
      // Substitute every {{token}} with a string so the shape can be parsed.
      const filled = preset.config.body.replace(/\{\{\w+\}\}/g, "value");
      expect(() => JSON.parse(filled), `${preset.id} body is not valid JSON`).not.toThrow();
    }
  });
});

describe("applyPreset", () => {
  const bySecretTarget = (target: string) =>
    API_PRESETS.find((p) => p.secret.target === target)!;

  it("puts a URL-style secret in the url", () => {
    const preset = bySecretTarget("url");
    const config = applyPreset(preset, "https://example.com/hook");
    expect(config.url).toBe("https://example.com/hook");
  });

  it("puts a header-style secret in the named header", () => {
    const preset = bySecretTarget("header");
    const config = applyPreset(preset, "sk-secret");
    const headers = config.headers as Record<string, string>;
    expect(headers[preset.secret.key!]).toContain("sk-secret");
  });

  it("applies the wrapper format rather than the bare value", () => {
    const resend = API_PRESETS.find((p) => p.id === "resend-email")!;
    const config = applyPreset(resend, "re_abc123");
    const headers = config.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_abc123");
  });

  it("keeps the preset's method and body", () => {
    const slack = API_PRESETS.find((p) => p.id === "slack-message")!;
    const config = applyPreset(slack, "https://hooks.slack.com/services/x");
    expect(config.method).toBe("POST");
    expect(config.body).toContain("{{result}}");
  });

  it("does not mutate the preset it was given", () => {
    const notion = API_PRESETS.find((p) => p.id === "notion-page")!;
    const before = JSON.stringify(notion.config);
    applyPreset(notion, "ntn_secret");
    applyPreset(notion, "ntn_other");
    expect(JSON.stringify(notion.config)).toBe(before);
  });

  it("produces a config for every preset without throwing", () => {
    for (const preset of API_PRESETS) {
      const config = applyPreset(preset, "test-value");
      expect(config.url, `${preset.id} produced no url`).toBeTruthy();
      expect(config.method, `${preset.id} produced no method`).toBeTruthy();
    }
  });
});

describe("extra fields", () => {
  const withExtras = API_PRESETS.filter((p) => (p.extraFields?.length ?? 0) > 0);

  it("declares a token that actually appears in the preset", () => {
    for (const preset of withExtras) {
      for (const field of preset.extraFields!) {
        const appears =
          preset.config.url.includes(field.token) ||
          (preset.config.body || "").includes(field.token);
        expect(
          appears,
          `${preset.id} asks for ${field.token} but never uses it`
        ).toBe(true);
      }
    }
  });

  it("substitutes into the url", () => {
    const airtable = API_PRESETS.find((p) => p.id === "airtable-record")!;
    const config = applyPreset(airtable, "patX", {
      YOUR_BASE_ID: "appReal",
      YOUR_TABLE_NAME: "Feedback",
    });
    expect(config.url).toBe("https://api.airtable.com/v0/appReal/Feedback");
  });

  it("substitutes into the body", () => {
    const notion = API_PRESETS.find((p) => p.id === "notion-page")!;
    const config = applyPreset(notion, "ntn_x", {
      YOUR_DATABASE_ID: "db-123",
    });
    expect(config.body).toContain('"database_id": "db-123"');
    expect(config.body).not.toContain("YOUR_DATABASE_ID");
  });

  it("substitutes every occurrence of a token", () => {
    const resend = API_PRESETS.find((p) => p.id === "resend-email")!;
    const config = applyPreset(resend, "re_x", {
      YOUR_FROM_ADDRESS: "me@a.com",
      YOUR_TO_ADDRESS: "you@b.com",
    });
    expect(config.body).toContain("me@a.com");
    expect(config.body).toContain("you@b.com");
  });

  it("leaves an unanswered token visible rather than blanking it", () => {
    // Blanking would produce a request that fails with a confusing server error;
    // leaving the token means the user can see what's still missing in the step.
    const notion = API_PRESETS.find((p) => p.id === "notion-page")!;
    const config = applyPreset(notion, "ntn_x", {});
    expect(config.body).toContain("YOUR_DATABASE_ID");
  });

  it("leaves a whitespace-only answer as unanswered", () => {
    const notion = API_PRESETS.find((p) => p.id === "notion-page")!;
    const config = applyPreset(notion, "ntn_x", { YOUR_DATABASE_ID: "   " });
    expect(config.body).toContain("YOUR_DATABASE_ID");
  });

  it("has no leftover placeholder in a preset that declares no extra fields", () => {
    for (const preset of API_PRESETS) {
      if (preset.extraFields?.length) continue;
      const text = preset.config.url + (preset.config.body || "");
      expect(text, `${preset.id} has an unclaimed placeholder`).not.toMatch(
        /YOUR_[A-Z_]+/
      );
    }
  });
});
