import { describe, expect, it } from "vitest";
import { createExecutor } from "@/lib/engine/executor";

/**
 * What a step can see when it runs.
 *
 * The editor's field picker offers values from every step upstream, so a person
 * can build exactly what the interface describes. The engine used to hand a step
 * only its direct predecessors' output, which meant a workflow assembled that
 * way ran with `{{themes}}` printed literally into the result. These tests pin
 * the two halves together.
 *
 * Only input, logic and output steps appear here, since those run without
 * reaching the network.
 */

type Node = Parameters<typeof createExecutor>[0][number];

const input = (id: string, fields: string[]): Node => ({
  id,
  type: "input",
  position: { x: 0, y: 0 },
  data: {
    label: id,
    config: {
      fields: fields.map((name) => ({ name, type: "string" })),
    },
  },
});

const rename = (id: string, mappings: Record<string, string>): Node => ({
  id,
  type: "logic",
  position: { x: 0, y: 0 },
  data: { label: id, config: { operation: "transform", mappings } },
});

const report = (id: string, template: string): Node => ({
  id,
  type: "output",
  position: { x: 0, y: 0 },
  data: { label: id, config: { format: "markdown", template } },
});

const wire = (...pairs: string[]) =>
  pairs.map((pair) => {
    const [source, target] = pair.split(">");
    return { id: pair, source, target };
  });

describe("what a step receives", () => {
  it("sees a value produced two steps back", async () => {
    // theme is named in the first transform, then two hops pass before the
    // report that refers to it.
    const result = await createExecutor(
      [
        input("start", ["reviews"]),
        rename("name-it", { theme: "reviews" }),
        rename("pass-through", { carried: "theme" }),
        report("write-up", "Theme: {{theme}}"),
      ],
      wire("start>name-it", "name-it>pass-through", "pass-through>write-up")
    ).execute({ reviews: "exports keep timing out" });

    expect(result.success, result.error).toBe(true);
    expect((result.output as { result: string }).result).toBe(
      "Theme: exports keep timing out"
    );
  });

  it("lets the nearer step win when two produce the same name", async () => {
    const result = await createExecutor(
      [
        input("start", ["text"]),
        rename("far", { answer: "text" }),
        rename("near", { answer: "text" }),
        report("write-up", "Answer: {{answer}}"),
      ],
      // far is two hops from the report, near is one.
      wire("start>far", "far>near", "near>write-up")
    ).execute({ text: "hello" });

    expect(result.success, result.error).toBe(true);
    // Both name the same key; the value is the one the nearest step produced.
    expect((result.output as { result: string }).result).toBe("Answer: hello");
  });

  it("says so in prose when nothing produced the value", async () => {
    const result = await createExecutor(
      [input("start", ["text"]), report("write-up", "Priority: {{priority}}")],
      wire("start>write-up")
    ).execute({ text: "hello" });

    expect(result.success, result.error).toBe(true);
    // A literal {{priority}} in a report means nothing to the person reading it.
    expect((result.output as { result: string }).result).toBe(
      "Priority: _no value_"
    );
  });
});
