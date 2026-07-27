import { describe, expect, it } from "vitest";
import { unresolvedReferences } from "@/lib/utils/fields";
import type { WorkflowNode } from "@/store/workflow";
import type { Edge } from "@xyflow/react";

/**
 * A generated workflow can quote values that nothing produces.
 *
 * The assistant writes both the steps and the report that quotes them, and it
 * does not always spell the names the same way in both. When it does not, the
 * report arrives with a heading and nothing underneath. This is the check that
 * catches it before the workflow reaches someone's canvas.
 */

const ask = (id: string, fields: string[]): WorkflowNode =>
  ({
    id,
    type: "input",
    position: { x: 0, y: 0 },
    data: {
      label: "Paste it in",
      config: { fields: fields.map((name) => ({ name, type: "string" })) },
    },
  }) as WorkflowNode;

const think = (id: string, gives: string[], prompt: string): WorkflowNode =>
  ({
    id,
    type: "ai",
    position: { x: 0, y: 0 },
    data: {
      label: "Read it",
      config: {
        userPromptTemplate: prompt,
        outputSchema: {
          type: "object",
          properties: Object.fromEntries(
            gives.map((name) => [name, { type: "string" }])
          ),
        },
      },
    },
  }) as WorkflowNode;

const report = (id: string, template: string): WorkflowNode =>
  ({
    id,
    type: "output",
    position: { x: 0, y: 0 },
    data: { label: "The write-up", config: { format: "markdown", template } },
  }) as WorkflowNode;

const wire = (...pairs: string[]): Edge[] =>
  pairs.map((pair) => {
    const [source, target] = pair.split(">");
    return { id: pair, source, target } as Edge;
  });

describe("unresolvedReferences", () => {
  it("passes a workflow whose report quotes declared values", () => {
    const problems = unresolvedReferences(
      [
        ask("n1", ["reviews"]),
        think("n2", ["themes"], "Read {{reviews}}"),
        report("n3", "## Themes\n{{themes}}"),
      ],
      wire("n1>n2", "n2>n3")
    );

    expect(problems).toEqual([]);
  });

  it("catches a report quoting a name nobody declared", () => {
    // The step gives back themes; the report asks for sentiment.
    const problems = unresolvedReferences(
      [
        ask("n1", ["reviews"]),
        think("n2", ["themes"], "Read {{reviews}}"),
        report("n3", "## Themes\n{{themes}}\n\n## Sentiment\n{{sentiment}}"),
      ],
      wire("n1>n2", "n2>n3")
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].id).toBe("n3");
    expect(problems[0].missing).toEqual(["sentiment"]);
    expect(problems[0].available).toContain("themes");
  });

  it("accepts a value produced further back than the previous step", () => {
    // themes comes from two steps back, which the engine now passes through.
    const problems = unresolvedReferences(
      [
        ask("n1", ["reviews"]),
        think("n2", ["themes"], "Read {{reviews}}"),
        think("n3", ["priority"], "Rank {{themes}}"),
        report("n4", "{{themes}} then {{priority}}"),
      ],
      wire("n1>n2", "n2>n3", "n3>n4")
    );

    expect(problems).toEqual([]);
  });

  it("reads a nested path through its root", () => {
    const problems = unresolvedReferences(
      [
        ask("n1", ["reviews"]),
        think("n2", ["summary"], "Read {{reviews}}"),
        report("n3", "{{summary.headline}}"),
      ],
      wire("n1>n2", "n2>n3")
    );

    expect(problems).toEqual([]);
  });

  it("flags a step that nothing is wired into", () => {
    const problems = unresolvedReferences(
      [ask("n1", ["reviews"]), report("n2", "{{reviews}}")],
      []
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].available).toEqual([]);
  });
});
