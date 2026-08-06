import { describe, expect, it } from "vitest";
import { deriveAppForm } from "@/lib/apps/form";

describe("deriveAppForm", () => {
  it("derives fields from an input node", () => {
    const snapshot = {
      nodes: [
        {
          type: "input",
          data: {
            config: {
              fields: [
                { name: "feedback", type: "string", required: true, label: "Customer feedback" },
                { name: "rating", type: "number" },
              ],
            },
          },
        },
      ],
    };

    const fields = deriveAppForm(snapshot);

    expect(fields).toEqual([
      { name: "feedback", label: "Customer feedback", type: "string", required: true, placeholder: undefined, description: undefined, multiline: undefined, default: undefined },
      { name: "rating", label: "Rating", type: "number", required: false, placeholder: undefined, description: undefined, multiline: undefined, default: undefined },
    ]);
  });

  it("falls back to a humanized name when there is no label", () => {
    const snapshot = {
      nodes: [
        { type: "input", data: { config: { fields: [{ name: "customerEmail" }] } } },
      ],
    };

    expect(deriveAppForm(snapshot)[0].label).toBe("Customer email");
  });

  it("filters to visibleFields when given", () => {
    const snapshot = {
      nodes: [
        {
          type: "input",
          data: {
            config: {
              fields: [
                { name: "a", type: "string" },
                { name: "b", type: "string" },
                { name: "c", type: "string" },
              ],
            },
          },
        },
      ],
    };

    const fields = deriveAppForm(snapshot, ["b"]);
    expect(fields.map((f) => f.name)).toEqual(["b"]);
  });

  it("ignores a non-input node", () => {
    const snapshot = {
      nodes: [
        { type: "ai", data: { config: { fields: [{ name: "should-not-appear" }] } } },
      ],
    };

    expect(deriveAppForm(snapshot)).toEqual([]);
  });

  it("skips a field with no name", () => {
    const snapshot = {
      nodes: [
        { type: "input", data: { config: { fields: [{ name: "", type: "string" }, { name: "ok", type: "string" }] } } },
      ],
    };

    expect(deriveAppForm(snapshot)).toHaveLength(1);
  });

  it("defaults an unrecognized type to string", () => {
    const snapshot = {
      nodes: [
        { type: "input", data: { config: { fields: [{ name: "doc", type: "file" }] } } },
      ],
    };

    expect(deriveAppForm(snapshot)[0].type).toBe("string");
  });

  it("survives a missing node list", () => {
    expect(deriveAppForm({})).toEqual([]);
  });

  it("ignores an empty visibleFields list", () => {
    const snapshot = {
      nodes: [
        { type: "input", data: { config: { fields: [{ name: "a", type: "string" }] } } },
      ],
    };

    expect(deriveAppForm(snapshot, [])).toHaveLength(1);
  });
});
