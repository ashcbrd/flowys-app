import { describe, expect, it } from "vitest";
import {
  inputFieldsOf,
  initialRunValues,
  placeholderFor,
  validateRunValues,
} from "@/components/inputs/RunForm";
import { humanizeFieldName } from "@/lib/vocabulary";
import type { InputField } from "@/lib/nodes/types";

/**
 * These three functions decide whether the Run button is reachable and what gets
 * handed to the engine, so they are the highest-consequence logic in the run
 * dialog even though they render nothing.
 */

const nodes = (fields: InputField[]) => [
  { type: "input", data: { config: { fields } } },
];

describe("inputFieldsOf", () => {
  it("returns the declared fields", () => {
    const fields: InputField[] = [{ name: "a", type: "string" }];
    expect(inputFieldsOf(nodes(fields))).toEqual(fields);
  });

  it("returns nothing when there is no input step", () => {
    expect(inputFieldsOf([{ type: "ai", data: { config: {} } }])).toEqual([]);
  });

  it("returns nothing for an input step with no fields", () => {
    // This is what makes the run dialog skip itself entirely.
    expect(inputFieldsOf(nodes([]))).toEqual([]);
  });

  it("survives a missing or empty graph", () => {
    expect(inputFieldsOf(undefined)).toEqual([]);
    expect(inputFieldsOf([])).toEqual([]);
  });

  it("drops a malformed field with no name", () => {
    const fields = [{ name: "", type: "string" }, { name: "ok", type: "string" }];
    expect(inputFieldsOf(nodes(fields as InputField[]))).toHaveLength(1);
  });
});

describe("initialRunValues", () => {
  it("never pre-types a text default into the field", () => {
    // A default is the engine's fallback for a blank answer, not something to
    // put in the box, where it reads as an answer somebody already gave. It
    // surfaces as the placeholder instead.
    const values = initialRunValues([
      { name: "tone", type: "string", default: "formal" },
    ]);
    expect(values.tone).toBe("");
  });

  it("surfaces the default as the placeholder when none is authored", () => {
    expect(placeholderFor({ name: "tone", type: "string", default: "formal" })).toBe("formal");
    expect(
      placeholderFor({ name: "tone", type: "string", default: "formal", placeholder: "e.g. warm" })
    ).toBe("e.g. warm");
    expect(placeholderFor({ name: "tone", type: "string" })).toBeUndefined();
  });

  it("seeds a true boolean default, the one kind a blank cannot carry", () => {
    // A switch always shows a real state and false submits as a value, so the
    // engine would never apply the default over it. Seeding is the only way a
    // true default survives.
    const values = initialRunValues([
      { name: "flag", type: "boolean", default: true },
    ]);
    expect(values.flag).toBe(true);
  });

  it("starts each type at something the control can render", () => {
    const values = initialRunValues([
      { name: "text", type: "string" },
      { name: "count", type: "number" },
      { name: "flag", type: "boolean" },
      { name: "group", type: "json" },
      { name: "doc", type: "file" },
    ]);

    expect(values).toEqual({
      text: "",
      // Empty rather than 0 so the number box starts blank instead of showing a
      // value the user did not choose.
      count: "",
      flag: false,
      group: {},
      doc: "",
    });
  });

  it("honours a false default rather than treating it as absent", () => {
    const values = initialRunValues([
      { name: "flag", type: "boolean", default: false },
    ]);
    expect(values.flag).toBe(false);
  });
});

describe("validateRunValues", () => {
  const required: InputField[] = [
    { name: "feedback", type: "string", required: true, label: "What did they say?" },
  ];

  it("reports a blank required field", () => {
    const errors = validateRunValues(required, { feedback: "" });
    expect(errors.feedback).toContain("What did they say?");
  });

  it("passes once the field is filled", () => {
    expect(validateRunValues(required, { feedback: "hello" })).toEqual({});
  });

  it("ignores optional fields left blank", () => {
    const fields: InputField[] = [{ name: "note", type: "string" }];
    expect(validateRunValues(fields, { note: "" })).toEqual({});
  });

  it("treats an empty group and empty list as blank", () => {
    const fields: InputField[] = [
      { name: "group", type: "json", required: true },
    ];
    expect(validateRunValues(fields, { group: {} })).toHaveProperty("group");
    expect(validateRunValues(fields, { group: [] })).toHaveProperty("group");
    expect(validateRunValues(fields, { group: { a: 1 } })).toEqual({});
  });

  it("treats an unread file as blank", () => {
    const fields: InputField[] = [{ name: "doc", type: "file", required: true }];
    expect(validateRunValues(fields, { doc: "" })).toHaveProperty("doc");
    expect(validateRunValues(fields, { doc: "file contents" })).toEqual({});
  });

  it("accepts zero and false as answers", () => {
    // A required number answered 0, or a required yes/no answered No, are both
    // real answers — rejecting them would block a legitimate run.
    const fields: InputField[] = [
      { name: "count", type: "number", required: true },
      { name: "flag", type: "boolean", required: true },
    ];
    expect(validateRunValues(fields, { count: 0, flag: false })).toEqual({});
  });

  it("names the field using its humanized name when it has no label", () => {
    const fields: InputField[] = [{ name: "customerEmail", type: "string", required: true }];
    expect(validateRunValues(fields, {}).customerEmail).toContain("Customer email");
  });
});

describe("humanizeFieldName", () => {
  it("splits camelCase", () => {
    expect(humanizeFieldName("customerEmail")).toBe("Customer email");
  });

  it("handles snake_case and kebab-case", () => {
    expect(humanizeFieldName("customer_email")).toBe("Customer email");
    expect(humanizeFieldName("customer-email")).toBe("Customer email");
  });

  it("leaves a single word capitalised", () => {
    expect(humanizeFieldName("feedback")).toBe("Feedback");
  });

  it("returns empty for empty input", () => {
    expect(humanizeFieldName("")).toBe("");
  });
});

describe("long-text fields", () => {
  it("keeps a declared long field as long even when empty", () => {
    // The decision must not depend on there being content yet — an empty
    // "paste the email" box still needs room.
    const fields: InputField[] = [
      { name: "email", type: "string", multiline: true },
    ];
    expect(initialRunValues(fields).email).toBe("");
    expect(fields[0].multiline).toBe(true);
  });

  it("still validates a long field as required", () => {
    const fields: InputField[] = [
      { name: "email", type: "string", required: true, multiline: true, label: "Paste the email" },
    ];
    expect(validateRunValues(fields, { email: "" })).toHaveProperty("email");
    expect(validateRunValues(fields, { email: "line one\nline two" })).toEqual({});
  });
});
