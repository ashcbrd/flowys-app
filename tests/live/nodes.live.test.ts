import { describe, expect, it } from "vitest";
import { createExecutor } from "@/lib/engine/executor";

/**
 * Live end-to-end coverage of every node type and the combinations users
 * actually build.
 *
 * Unlike the default suite, this makes real network calls — real model requests
 * and real HTTP — so it needs keys in `.env` and is excluded from `npm test`.
 * Run it with `npm run test:live`.
 *
 * Model steps use OpenAI's cheapest current model deliberately: the point is to
 * exercise the engine's plumbing, not to evaluate output quality.
 */

const MODEL = { provider: "openai", model: "gpt-4o-mini" };

// A stable, unauthenticated JSON API for exercising the HTTP node.
const REST = "https://jsonplaceholder.typicode.com";

type Node = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; config: Record<string, unknown> };
};

let x = 0;
function node(
  type: string,
  label: string,
  config: Record<string, unknown>,
  id?: string
): Node {
  x += 260;
  return {
    id: id || `${type}_${x}`,
    type,
    position: { x, y: 200 },
    data: { label, config },
  };
}

function chain(...nodes: Node[]) {
  const edges = nodes.slice(1).map((n, i) => ({
    id: `e${i}`,
    source: nodes[i].id,
    target: n.id,
  }));
  return { nodes, edges };
}

async function run(
  graph: { nodes: Node[]; edges: { id: string; source: string; target: string }[] },
  input: Record<string, unknown> = {}
) {
  const executor = createExecutor(graph.nodes as never, graph.edges as never);
  return executor.execute(input);
}

/** A json-format output step wraps its values as { result, format }. */
function jsonResult(r: Awaited<ReturnType<typeof run>>): Record<string, unknown> {
  return (r.output?.result ?? {}) as Record<string, unknown>;
}

/** Fails with the engine's own diagnosis attached, which is what a user sees. */
function expectSuccess(result: Awaited<ReturnType<typeof run>>) {
  if (!result.success) {
    const causes = result.errorAnalysis?.possibleCauses?.join("; ") || "";
    throw new Error(`${result.error}\n  diagnosis: ${causes}`);
  }
  expect(result.success).toBe(true);
}

const LONG = 120_000;

// ---------------------------------------------------------------------------
// Individual node types
// ---------------------------------------------------------------------------

describe("input node", () => {
  it("passes every field type through with the right JS type", async () => {
    const graph = chain(
      node("input", "Ask", {
        fields: [
          { name: "text", type: "string" },
          { name: "count", type: "number" },
          { name: "flag", type: "boolean" },
          { name: "group", type: "json" },
          { name: "doc", type: "file" },
        ],
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, {
      text: "hello",
      count: "42", // arrives as a string from a form and must be coerced
      flag: "true",
      group: { a: 1 },
      doc: "file text",
    });

    expectSuccess(result);
    expect(jsonResult(result)).toMatchObject({
      text: "hello",
      count: 42,
      flag: true,
      group: { a: 1 },
      doc: "file text",
    });
  });

  it("applies declared defaults when a value is missing", async () => {
    const graph = chain(
      node("input", "Ask", {
        fields: [{ name: "tone", type: "string", default: "formal" }],
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, {});
    expectSuccess(result);
    expect(jsonResult(result).tone).toBe("formal");
  });
});

describe("ai node", () => {
  it(
    "returns data matching its declared shape",
    async () => {
      const graph = chain(
        node("input", "Ask", { fields: [{ name: "feedback", type: "string" }] }),
        node("ai", "Classify", {
          ...MODEL,
          systemPrompt: "You classify customer feedback.",
          userPromptTemplate: "Classify: {{feedback}}",
          maxTokens: 500,
          outputSchema: {
            type: "object",
            properties: {
              category: { type: "string", description: "bug, praise or other" },
              urgent: { type: "boolean", description: "true if urgent" },
            },
            required: ["category", "urgent"],
          },
        }),
        node("output", "Result", { format: "json" })
      );

      const result = await run(graph, {
        feedback: "The export button has been broken for a week and I'm furious.",
      });

      expectSuccess(result);
      expect(typeof jsonResult(result).category).toBe("string");
      expect(typeof jsonResult(result).urgent).toBe("boolean");
    },
    LONG
  );

  it(
    "returns plain text when it declares no shape",
    async () => {
      const graph = chain(
        node("ai", "Write", {
          ...MODEL,
          userPromptTemplate: "Say the single word: ready",
          maxTokens: 20,
        }),
        node("output", "Result", { format: "json" })
      );

      const result = await run(graph);
      expectSuccess(result);
      expect(String(jsonResult(result).response ?? jsonResult(result).text)).toMatch(/\w/);
    },
    LONG
  );

  it("uses the configured AI even when a step stored a different one", async () => {
    // Workflows saved when the provider was selectable may name Anthropic with a
    // retired model and no key behind it. The engine overrides both, so the step
    // still runs — this is what stops old workflows breaking.
    const graph = chain(
      node("ai", "Legacy step", {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514", // retired
        userPromptTemplate: "Reply with the single word: ok",
        maxTokens: 20,
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph);
    expectSuccess(result);
    expect(String(jsonResult(result).response ?? jsonResult(result).text)).toMatch(/\w/);
  }, LONG);
});

describe("api node", () => {
  it("fetches JSON and maps chosen fields out", async () => {
    const graph = chain(
      node("api", "Fetch", {
        url: `${REST}/todos/1`,
        method: "GET",
        responseMapping: { heading: "title", done: "completed" },
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph);
    expectSuccess(result);
    expect(typeof jsonResult(result).heading).toBe("string");
  }, LONG);

  it("interpolates a value from an earlier step into the address", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "id", type: "number" }] }),
      node("api", "Fetch", {
        url: `${REST}/todos/{{id}}`,
        method: "GET",
        responseMapping: { heading: "title" },
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, { id: 2 });
    expectSuccess(result);
    expect(jsonResult(result).heading).toBeTruthy();
  }, LONG);

  it("sends a templated body on POST", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "title", type: "string" }] }),
      node("api", "Create", {
        url: `${REST}/posts`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"title": "{{title}}", "body": "from a test", "userId": 1}',
        responseMapping: { created: "id" },
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, { title: "hello from flowys" });
    expectSuccess(result);
    expect(jsonResult(result).created).toBeTruthy();
  }, LONG);

  it("refuses a private address", async () => {
    const graph = chain(
      node("api", "Internal", { url: "http://127.0.0.1:3001/", method: "GET" })
    );

    const result = await run(graph);
    expect(result.success).toBe(false);
    expect(result.errorAnalysis?.possibleCauses.join(" ")).toMatch(
      /private network/
    );
  }, LONG);

  it("refuses the cloud metadata address", async () => {
    const graph = chain(
      node("api", "Metadata", {
        url: "http://169.254.169.254/latest/meta-data/",
        method: "GET",
      })
    );

    const result = await run(graph);
    expect(result.success).toBe(false);
  }, LONG);
});

describe("logic node — every operation", () => {
  const withList = (config: Record<string, unknown>) =>
    chain(
      node("api", "Fetch", {
        url: `${REST}/todos?_limit=10`,
        method: "GET",
        // No mapping: an array response is exposed as { data, count } already.
      }),
      node("logic", "Work", config),
      node("output", "Result", { format: "json" })
    );

  it("filter keeps only matching items", async () => {
    const result = await run(
      withList({ operation: "filter", condition: "item.completed === true" })
    );
    expectSuccess(result);
    const items = jsonResult(result).data as { completed: boolean }[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.every((i) => i.completed === true)).toBe(true);
  }, LONG);

  it("map reshapes each item", async () => {
    const result = await run(
      withList({ operation: "map", mappings: { heading: "item.title" } })
    );
    expectSuccess(result);
    const items = jsonResult(result).data as { heading: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => typeof i.heading === "string")).toBe(true);
  }, LONG);

  it("reduce counts a list", async () => {
    const result = await run(withList({ operation: "reduce", expression: "count" }));
    expectSuccess(result);
    expect(jsonResult(result).result).toBe(10);
  }, LONG);

  it("reduce sums a field", async () => {
    const result = await run(
      withList({ operation: "reduce", expression: "sum:id" })
    );
    expectSuccess(result);
    expect(jsonResult(result).result).toBe(55); // ids 1..10
  }, LONG);

  it("sort reorders a list", async () => {
    const result = await run(
      withList({ operation: "sort", expression: "asc:id" })
    );
    expectSuccess(result);
    expect(Array.isArray(jsonResult(result).data)).toBe(true);
  }, LONG);

  it("slice takes part of a list", async () => {
    const result = await run(withList({ operation: "slice", expression: "0:3" }));
    expectSuccess(result);
    const items = jsonResult(result).data as unknown[];
    expect(items.length).toBeLessThanOrEqual(10);
  }, LONG);

  it("transform renames fields", async () => {
    const graph = chain(
      node("input", "Ask", {
        fields: [{ name: "customerEmail", type: "string" }],
      }),
      node("logic", "Rename", {
        operation: "transform",
        mappings: { contact: "customerEmail" },
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, { customerEmail: "a@b.com" });
    expectSuccess(result);
    expect(jsonResult(result).contact).toBe("a@b.com");
  });

  it("condition reports which way it went", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "score", type: "number" }] }),
      node("logic", "Check", { operation: "condition", condition: "score >= 6" }),
      node("output", "Result", { format: "json" })
    );

    const high = await run(graph, { score: 9 });
    expectSuccess(high);
    expect(jsonResult(high).branch).toBe("true");

    const low = await run(graph, { score: 2 });
    expectSuccess(low);
    expect(jsonResult(low).branch).toBe("false");
  });

  it("passthrough leaves data alone", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "a", type: "string" }] }),
      node("logic", "Pass", { operation: "passthrough" }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, { a: "unchanged" });
    expectSuccess(result);
    expect(jsonResult(result).a).toBe("unchanged");
  });

  it("explains itself when a list step gets no list", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "text", type: "string" }] }),
      node("logic", "Filter", { operation: "filter", condition: "item.x === 1" })
    );

    const result = await run(graph, { text: "not a list" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/didn't produce a list/);
  });
});

describe("output node — every format", () => {
  const base = (config: Record<string, unknown>) =>
    chain(
      node("input", "Ask", { fields: [{ name: "name", type: "string" }] }),
      node("output", "Result", config)
    );

  it("json returns the values", async () => {
    const result = await run(base({ format: "json" }), { name: "Sam" });
    expectSuccess(result);
    expect(jsonResult(result).name).toBe("Sam");
  });

  it("json can narrow to chosen fields", async () => {
    const graph = chain(
      node("input", "Ask", {
        fields: [
          { name: "keep", type: "string" },
          { name: "drop", type: "string" },
        ],
      }),
      node("output", "Result", { format: "json", fields: ["keep"] })
    );

    const result = await run(graph, { keep: "yes", drop: "no" });
    expectSuccess(result);
    expect(jsonResult(result)).toHaveProperty("keep");
    expect(jsonResult(result)).not.toHaveProperty("drop");
  });

  it("text fills a template", async () => {
    const result = await run(
      base({ format: "text", template: "Hello {{name}}!" }),
      { name: "Sam" }
    );
    expectSuccess(result);
    expect(result.output?.result).toBe("Hello Sam!");
  });

  it("markdown fills a template", async () => {
    const result = await run(
      base({ format: "markdown", template: "# {{name}}" }),
      { name: "Sam" }
    );
    expectSuccess(result);
    expect(result.output?.result).toBe("# Sam");
  });
});

describe("webhook node", () => {
  it("posts a templated payload", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "summary", type: "string" }] }),
      node("webhook", "Send", {
        url: `${REST}/posts`,
        method: "POST",
        payloadTemplate: { title: "{{summary}}", userId: 1 },
      }),
      node("output", "Result", { format: "json" })
    );

    const result = await run(graph, { summary: "webhook payload" });
    expectSuccess(result);
  }, LONG);
});

describe("integration node", () => {
  it("fails with an explanation rather than crashing", async () => {
    // App connections are disabled; the handler must still degrade cleanly.
    const graph = chain(
      node("integration", "Slack", {
        connectionId: "does-not-exist",
        integrationId: "slack",
        actionId: "send",
        input: {},
      })
    );

    const result = await run(graph);
    expect(result.success).toBe(false);
    expect(result.errorAnalysis).toBeDefined();
  }, LONG);
});

// ---------------------------------------------------------------------------
// Combinations
// ---------------------------------------------------------------------------

describe("combinations", () => {
  it(
    "input -> ai -> logic(condition) -> output",
    async () => {
      const graph = chain(
        node("input", "Ask", { fields: [{ name: "enquiry", type: "string" }] }),
        node("ai", "Score", {
          ...MODEL,
          userPromptTemplate: "Score this enquiry 1-10 for buying intent: {{enquiry}}",
          maxTokens: 300,
          outputSchema: {
            type: "object",
            properties: { fitScore: { type: "number", description: "1-10" } },
            required: ["fitScore"],
          },
        }),
        node("logic", "Worth it?", {
          operation: "condition",
          condition: "fitScore >= 5",
        }),
        node("output", "Result", {
          format: "markdown",
          template: "Worth replying: {{branch}} (score {{data.fitScore}})",
        })
      );

      const result = await run(graph, {
        enquiry: "We have budget approved and want to start next week.",
      });

      expectSuccess(result);
      // A condition branch reads as prose ("Yes"/"No"), not the stored
      // "true"/"false" — see interpolateVariables' list/yes-no rendering.
      expect(String(result.output?.result)).toMatch(/Worth replying: (Yes|No)/);
      expect(String(result.output?.result)).not.toMatch(/\{\{/);
    },
    LONG
  );

  it(
    "api -> logic(filter) -> logic(reduce) -> output",
    async () => {
      const graph = chain(
        node("api", "Fetch", {
          url: `${REST}/todos?_limit=20`,
          method: "GET",
        }),
        node("logic", "Only done", {
          operation: "filter",
          condition: "item.completed === true",
        }),
        node("logic", "Count", { operation: "reduce", expression: "count" }),
        node("output", "Result", {
          format: "text",
          template: "{{result}} completed",
        })
      );

      const result = await run(graph);
      expectSuccess(result);
      expect(String(result.output?.result)).toMatch(/^\d+ completed$/);
    },
    LONG
  );

  it(
    "api -> ai -> output (model reads real fetched data)",
    async () => {
      const graph = chain(
        node("api", "Fetch", {
          url: `${REST}/todos/1`,
          method: "GET",
          responseMapping: { heading: "title" },
        }),
        node("ai", "Summarise", {
          ...MODEL,
          userPromptTemplate: "Reply with just YES if this is a task: {{heading}}",
          maxTokens: 20,
          outputSchema: {
            type: "object",
            properties: { answer: { type: "string", description: "YES or NO" } },
            required: ["answer"],
          },
        }),
        node("output", "Result", { format: "json" })
      );

      const result = await run(graph);
      expectSuccess(result);
      expect(jsonResult(result).answer).toBeTruthy();
    },
    LONG
  );

  it(
    "two model steps in series pass data along",
    async () => {
      const graph = chain(
        node("input", "Ask", { fields: [{ name: "topic", type: "string" }] }),
        node("ai", "Pick", {
          ...MODEL,
          userPromptTemplate: "Name one colour associated with {{topic}}.",
          maxTokens: 100,
          outputSchema: {
            type: "object",
            properties: { colour: { type: "string", description: "one colour" } },
            required: ["colour"],
          },
        }),
        node("ai", "Use it", {
          ...MODEL,
          userPromptTemplate: "Is {{colour}} warm or cool? One word.",
          maxTokens: 100,
          outputSchema: {
            type: "object",
            properties: { temperature: { type: "string", description: "warm or cool" } },
            required: ["temperature"],
          },
        }),
        node("output", "Result", { format: "json" })
      );

      const result = await run(graph, { topic: "the ocean" });
      expectSuccess(result);
      expect(jsonResult(result).temperature).toBeTruthy();
    },
    LONG
  );

  it(
    "a diamond merges two branches into one step",
    async () => {
      const ask = node("input", "Ask", {
        fields: [{ name: "id", type: "number" }],
      });
      const fetchA = node("api", "Fetch todo", {
        url: `${REST}/todos/{{id}}`,
        method: "GET",
        responseMapping: { todo: "title" },
      });
      const fetchB = node("api", "Fetch user", {
        url: `${REST}/users/{{id}}`,
        method: "GET",
        responseMapping: { person: "name" },
      });
      const out = node("output", "Result", {
        format: "text",
        template: "{{person}} — {{todo}}",
      });

      const result = await run(
        {
          nodes: [ask, fetchA, fetchB, out],
          edges: [
            { id: "e1", source: ask.id, target: fetchA.id },
            { id: "e2", source: ask.id, target: fetchB.id },
            { id: "e3", source: fetchA.id, target: out.id },
            { id: "e4", source: fetchB.id, target: out.id },
          ],
        },
        { id: 1 }
      );

      expectSuccess(result);
      expect(String(result.output?.result)).not.toMatch(/\{\{/);
      expect(String(result.output?.result)).toContain("—");
    },
    LONG
  );

  it("rejects a workflow that loops back on itself", async () => {
    const a = node("logic", "A", { operation: "passthrough" }, "a");
    const b = node("logic", "B", { operation: "passthrough" }, "b");

    const result = await run({
      nodes: [a, b],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cycle/i);
  });

  it("runs a long chain in the right order", async () => {
    const graph = chain(
      node("input", "Ask", { fields: [{ name: "v", type: "number" }] }),
      node("logic", "Pass 1", { operation: "passthrough" }),
      node("logic", "Rename", { operation: "transform", mappings: { w: "v" } }),
      node("logic", "Pass 2", { operation: "passthrough" }),
      node("output", "Result", { format: "text", template: "value {{w}}" })
    );

    const result = await run(graph, { v: 7 });
    expectSuccess(result);
    expect(result.output?.result).toBe("value 7");
    expect(result.logs).toHaveLength(5);
  });
});
