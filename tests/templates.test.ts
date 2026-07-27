import { describe, expect, it, vi, beforeEach } from "vitest";
import { TEMPLATES } from "@/lib/templates";

/**
 * Runs every shipped template through the real executor.
 *
 * Templates are hand-written config, so a wrong field name or a mismatched node
 * shape would only surface when a user pressed Run. This drives the actual
 * engine — topological sort, input coercion, templating, output formatting — with
 * only the model call stubbed, so everything except the network is exercised.
 */

// The AI step's only outside dependency. Returning keys drawn from each step's
// declared outputSchema means the templating in later steps resolves for real.
const executePrompt = vi.fn();

vi.mock("@/lib/providers", () => ({
  executePrompt: (...args: unknown[]) => executePrompt(...args),
}));

const { createExecutor } = await import("@/lib/engine/executor");

interface AiConfig {
  outputSchema?: {
    properties?: Record<string, { type?: string; description?: string }>;
  };
}

/** A plausible value for each declared output property. */
function stubOutput(config: AiConfig): Record<string, unknown> {
  const properties = config.outputSchema?.properties || {};
  const output: Record<string, unknown> = {};

  for (const [name, prop] of Object.entries(properties)) {
    switch (prop?.type) {
      case "number":
        output[name] = 8;
        break;
      case "boolean":
        output[name] = true;
        break;
      case "array":
        output[name] = [`${name} one`, `${name} two`];
        break;
      case "object":
        output[name] = { note: `${name} detail` };
        break;
      default:
        output[name] = `${name} value`;
    }
  }

  return output;
}

/** Values for whatever a template's input step declares. */
function stubInput(template: (typeof TEMPLATES)[number]): Record<string, unknown> {
  const inputNode = template.workflow.nodes.find((n) => n.type === "input");
  const fields =
    (inputNode?.data.config?.fields as
      | { name: string; type?: string }[]
      | undefined) || [];

  const input: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field.type) {
      case "number":
        input[field.name] = 3;
        break;
      case "boolean":
        input[field.name] = true;
        break;
      case "json":
        input[field.name] = { sample: true };
        break;
      default:
        // Covers string and file — a file field arrives as extracted text.
        input[field.name] = `sample ${field.name}`;
    }
  }

  return input;
}

beforeEach(() => {
  executePrompt.mockReset();
  executePrompt.mockImplementation(
    async (
      _provider: string,
      config: AiConfig,
      _messages: unknown,
      schema: AiConfig["outputSchema"]
    ) => stubOutput({ outputSchema: schema ?? config.outputSchema })
  );
});

describe("every template is structurally sound", () => {
  it("ships at least one template", () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s has unique node ids and edges that point at real nodes",
    (_id, template) => {
      const ids = template.workflow.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);

      for (const edge of template.workflow.edges) {
        expect(ids, `edge ${edge.id} source`).toContain(edge.source);
        expect(ids, `edge ${edge.id} target`).toContain(edge.target);
      }
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s uses no step type that needs an app connection",
    (_id, template) => {
      // Templates are the zero-setup entry point; an integration step would make
      // one a dead end while app connections are disabled.
      const types = template.workflow.nodes.map((n) => n.type);
      expect(types).not.toContain("integration");
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s pins no provider or model",
    (_id, template) => {
      // The engine resolves which AI to use, so a template that named one could
      // pin something the deployment can't run.
      for (const node of template.workflow.nodes) {
        if (node.type !== "ai") continue;
        expect(node.data.config).not.toHaveProperty("provider");
        expect(node.data.config).not.toHaveProperty("model");
      }
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s lays out with no two steps on top of each other",
    (_id, template) => {
      // These graphs are wide enough that a duplicated position hides a step
      // completely on the canvas.
      const seen = new Map<string, string>();

      for (const node of template.workflow.nodes) {
        const key = `${node.position.x},${node.position.y}`;
        const clash = seen.get(key);
        expect(
          clash,
          `"${node.data.label}" sits on top of "${clash}" at ${key}`
        ).toBeUndefined();
        seen.set(key, node.data.label);
      }
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s reaches its result from the question it asks",
    (_id, template) => {
      // A step with no path to the output never contributes anything, and a
      // result with no path from the input can't use the user's answers.
      const forward = new Map<string, string[]>();
      for (const edge of template.workflow.edges) {
        forward.set(edge.source, [...(forward.get(edge.source) || []), edge.target]);
      }

      const start = template.workflow.nodes.find((n) => n.type === "input");
      expect(start, "template has no question step").toBeDefined();

      const reached = new Set<string>([start!.id]);
      const queue = [start!.id];
      while (queue.length) {
        for (const next of forward.get(queue.shift()!) || []) {
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }

      for (const node of template.workflow.nodes) {
        expect(
          reached.has(node.id),
          `"${node.data.label}" is not reachable from the question step`
        ).toBe(true);
      }
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s is a substantial automation, not a demo",
    (_id, template) => {
      // The whole point of these is to show what the product can do.
      expect(template.workflow.nodes.length).toBeGreaterThanOrEqual(10);
      expect(template.workflow.nodes.length).toBeLessThanOrEqual(20);

      // And the stated size must match reality.
      const claimed = template.description.match(/^(\d+) steps\./);
      expect(claimed, "description should open with the step count").not.toBeNull();
      expect(Number(claimed![1])).toBe(template.workflow.nodes.length);
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s only references values its own inputs actually carry",
    (_id, template) => {
      // The engine hands a step the merged output of its DIRECT predecessors
      // only — not everything produced anywhere upstream. A token from two hops
      // back renders literally as {{name}} in the result, which reads as a
      // broken template. This mirrors `getNodeInputs` in the executor.
      const outputsOf = (node: (typeof template.workflow.nodes)[number]) => {
        const config = node.data.config as Record<string, unknown>;

        if (node.type === "input") {
          return ((config.fields as { name: string }[]) || []).map((f) => f.name);
        }
        if (node.type === "ai") {
          const schema = config.outputSchema as AiConfig["outputSchema"];
          return Object.keys(schema?.properties || {});
        }
        if (node.type === "logic") {
          switch (config.operation) {
            case "condition":
              return ["result", "branch", "data"];
            case "transform":
            case "map":
              // Both build their output from `mappings`, so the keys are the
              // names the step actually emits.
              return Object.keys((config.mappings as Record<string, string>) || {});
            case "reduce":
              return ["result"];
            default:
              // filter / sort / slice hand on the list plus its size.
              return ["data", "count"];
          }
        }
        return [];
      };

      const byId = new Map(template.workflow.nodes.map((n) => [n.id, n]));

      for (const node of template.workflow.nodes) {
        const predecessors = template.workflow.edges
          .filter((e) => e.target === node.id)
          .map((e) => byId.get(e.source))
          .filter(Boolean);

        const available = new Set(
          predecessors.flatMap((p) => outputsOf(p!))
        );

        // An input step also receives the values the person typed in.
        if (node.type === "input") {
          for (const name of outputsOf(node)) available.add(name);
        }

        const config = node.data.config as Record<string, unknown>;
        const texts = [config.userPromptTemplate, config.template, config.body]
          .filter((v): v is string => typeof v === "string");

        for (const text of texts) {
          for (const token of text.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) || []) {
            const root = token.slice(2, -2).split(".")[0];
            expect(
              available,
              `"${node.data.label}" references ${token}, which its inputs don't carry`
            ).toContain(root);
          }
        }
      }
    }
  );
});

describe("every template runs end to end", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s completes successfully",
    async (_id, template) => {
      const executor = createExecutor(
        template.workflow.nodes as never,
        template.workflow.edges as never
      );

      const result = await executor.execute(stubInput(template));

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s runs every one of its steps",
    async (_id, template) => {
      const executor = createExecutor(
        template.workflow.nodes as never,
        template.workflow.edges as never
      );

      const result = await executor.execute(stubInput(template));

      expect(result.logs).toHaveLength(template.workflow.nodes.length);
      expect(result.logs.every((log) => log.status === "completed")).toBe(true);
    }
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s produces a result with no unresolved placeholders",
    async (_id, template) => {
      const executor = createExecutor(
        template.workflow.nodes as never,
        template.workflow.edges as never
      );

      const result = await executor.execute(stubInput(template));
      const rendered = JSON.stringify(result.output);

      expect(rendered, "result still contains an unfilled {{token}}").not.toMatch(
        /\{\{\w/
      );
    }
  );
});

describe("template failures are explained, not just reported", () => {
  it("names the key when the provider rejects credentials", async () => {
    executePrompt.mockRejectedValue(new Error("401 Incorrect API key provided"));

    const template = TEMPLATES[0];
    const executor = createExecutor(
      template.workflow.nodes as never,
      template.workflow.edges as never
    );

    const result = await executor.execute(stubInput(template));

    expect(result.success).toBe(false);
    expect(result.errorAnalysis?.possibleCauses.join(" ")).toMatch(
      /key is missing, wrong, or expired/
    );
  });

  it("names rate limiting when the provider throttles", async () => {
    executePrompt.mockRejectedValue(new Error("429 rate limit exceeded"));

    const template = TEMPLATES[0];
    const executor = createExecutor(
      template.workflow.nodes as never,
      template.workflow.edges as never
    );

    const result = await executor.execute(stubInput(template));

    expect(result.success).toBe(false);
    expect(result.errorAnalysis?.suggestedFixes.join(" ")).toMatch(/Wait a minute/);
  });

  it("attaches a diagnosis naming the step that failed", async () => {
    executePrompt.mockRejectedValue(new Error("404 model_not_found"));

    const template = TEMPLATES[0];
    const executor = createExecutor(
      template.workflow.nodes as never,
      template.workflow.edges as never
    );

    const result = await executor.execute(stubInput(template));

    expect(result.success).toBe(false);
    expect(result.errorAnalysis).toBeDefined();
    expect(result.errorAnalysis?.possibleCauses.join(" ")).toContain(
      "doesn't exist any more"
    );
    expect(result.errorAnalysis?.suggestedFixes.length).toBeGreaterThan(0);
  });
});
