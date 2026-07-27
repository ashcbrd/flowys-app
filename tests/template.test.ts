import { describe, expect, it } from "vitest";
import {
  interpolateVariables,
  interpolateDeep,
  parseTemplate,
  extractTokens,
  getNestedValue,
  toToken,
} from "@/lib/utils/template";

/**
 * The templating grammar has four call sites in the engine and one in the UI
 * field picker. They must agree exactly, which is why this module exists and why
 * it is the first thing worth testing.
 */

describe("interpolateVariables", () => {
  it("substitutes a simple token", () => {
    expect(interpolateVariables("Hello {{name}}", { name: "Sam" })).toBe(
      "Hello Sam"
    );
  });

  it("substitutes a nested path", () => {
    expect(
      interpolateVariables("{{user.email}}", { user: { email: "a@b.com" } })
    ).toBe("a@b.com");
  });

  it("serialises objects rather than rendering [object Object]", () => {
    expect(interpolateVariables("{{data}}", { data: { a: 1 } })).toBe(
      '{"a":1}'
    );
  });

  it("substitutes every occurrence, not just the first", () => {
    expect(interpolateVariables("{{a}}-{{a}}-{{a}}", { a: "x" })).toBe("x-x-x");
  });

  it("leaves a missing variable in place by default", () => {
    // ai.ts, webhook.ts and output.ts rely on this.
    expect(interpolateVariables("Hi {{missing}}", {})).toBe("Hi {{missing}}");
  });

  it("replaces a missing variable with empty string when asked", () => {
    // api.ts relies on this — the two behaviours had diverged before the
    // implementations were consolidated, so both are pinned here.
    expect(interpolateVariables("Hi {{missing}}", {}, "empty")).toBe("Hi ");
  });

  it("does not treat a lone brace pair as a token", () => {
    expect(interpolateVariables("{ not a token }", {})).toBe("{ not a token }");
  });

  it("handles a falsy value without falling back to the token", () => {
    expect(interpolateVariables("{{count}}", { count: 0 })).toBe("0");
    expect(interpolateVariables("{{flag}}", { flag: false })).toBe("false");
  });

  it("is not affected by regex state across calls", () => {
    // A shared /g regex would make the second call skip — the module builds a
    // fresh RegExp per call to avoid exactly this.
    const first = interpolateVariables("{{a}}", { a: "1" });
    const second = interpolateVariables("{{a}}", { a: "2" });
    expect([first, second]).toEqual(["1", "2"]);
  });
});

describe("getNestedValue", () => {
  it("returns undefined for a path that runs off the end", () => {
    expect(getNestedValue({ a: 1 }, "a.b.c")).toBeUndefined();
  });

  it("returns undefined rather than throwing on null mid-path", () => {
    expect(getNestedValue({ a: null }, "a.b")).toBeUndefined();
  });
});

describe("parseTemplate", () => {
  it("splits literal text and variables in order", () => {
    expect(parseTemplate("a {{b}} c")).toEqual([
      { kind: "text", value: "a " },
      { kind: "variable", path: "b" },
      { kind: "text", value: " c" },
    ]);
  });

  it("handles a template that is only a variable", () => {
    expect(parseTemplate("{{only}}")).toEqual([
      { kind: "variable", path: "only" },
    ]);
  });

  it("returns an empty list for an empty template", () => {
    expect(parseTemplate("")).toEqual([]);
  });

  it("round-trips through toToken", () => {
    expect(parseTemplate(toToken("field"))).toEqual([
      { kind: "variable", path: "field" },
    ]);
  });
});

describe("extractTokens", () => {
  it("lists every referenced path once per occurrence", () => {
    expect(extractTokens("{{a}} {{b.c}} {{a}}")).toEqual(["a", "b.c", "a"]);
  });
});

describe("interpolateDeep", () => {
  it("substitutes inside nested objects and arrays", () => {
    const result = interpolateDeep(
      { title: "{{name}}", tags: ["{{tag}}", "fixed"], nested: { x: "{{n}}" } },
      { name: "Sam", tag: "urgent", n: 5 }
    );

    expect(result).toEqual({
      title: "Sam",
      tags: ["urgent", "fixed"],
      nested: { x: "5" },
    });
  });

  it("leaves non-string leaves untouched", () => {
    expect(interpolateDeep({ n: 1, b: true, z: null }, {})).toEqual({
      n: 1,
      b: true,
      z: null,
    });
  });
});

describe("array rendering style", () => {
  it("defaults to JSON so request bodies stay machine-readable", () => {
    expect(interpolateVariables("{{items}}", { items: ["a", "b"] })).toBe('["a","b"]');
  });

  it("renders bullets when the target is prose", () => {
    expect(
      interpolateVariables("{{items}}", { items: ["a", "b"] }, "keep", "list")
    ).toBe("- a\n- b");
  });

  it("says so when a list is empty rather than printing []", () => {
    expect(
      interpolateVariables("{{items}}", { items: [] }, "keep", "list")
    ).toBe("_none_");
  });

  it("leaves non-array objects as JSON even in list mode", () => {
    expect(
      interpolateVariables("{{obj}}", { obj: { a: 1 } }, "keep", "list")
    ).toBe('{"a":1}');
  });

  it("falls back to JSON for objects inside a list", () => {
    expect(
      interpolateVariables("{{items}}", { items: [{ a: 1 }] }, "keep", "list")
    ).toBe('- {"a":1}');
  });

  it("reads a yes/no value as Yes or No in prose", () => {
    expect(
      interpolateVariables("{{ok}}", { ok: true }, "keep", "list")
    ).toBe("Yes");
    expect(
      interpolateVariables("{{ok}}", { ok: false }, "keep", "list")
    ).toBe("No");
  });

  it("reads a condition branch as Yes or No in prose", () => {
    // A condition step hands on the branch it took as a string.
    expect(
      interpolateVariables("{{branch}}", { branch: "true" }, "keep", "list")
    ).toBe("Yes");
    expect(
      interpolateVariables("{{branch}}", { branch: "false" }, "keep", "list")
    ).toBe("No");
  });

  it("keeps true and false machine-readable outside prose", () => {
    expect(interpolateVariables("{{ok}}", { ok: true })).toBe("true");
    expect(
      interpolateVariables("{{branch}}", { branch: "false" }, "empty", "json")
    ).toBe("false");
  });
});
