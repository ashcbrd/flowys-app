import { executeNode, type NodeResult } from "@/lib/nodes";
import type { NodeData, EdgeData, ExecutionLog } from "@/lib/db";

export interface ErrorAnalysis {
  summary: string;
  failedNode: string;
  failedNodeType: string;
  possibleCauses: string[];
  suggestedFixes: string[];
  affectedNodes: string[];
}

export interface WorkflowExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  errorAnalysis?: ErrorAnalysis;
  logs: ExecutionLog[];
  duration: number;
}

export interface ExecutionContext {
  nodeOutputs: Map<string, Record<string, unknown>>;
  globalContext: Record<string, unknown>;
  logs: ExecutionLog[];
}

export type ExecutionCallback = (log: ExecutionLog, allLogs: ExecutionLog[]) => void;

export class WorkflowExecutor {
  private nodes: NodeData[];
  private edges: EdgeData[];
  private adjacencyList: Map<string, string[]>;
  private inDegree: Map<string, number>;
  private nodeMap: Map<string, NodeData>;

  constructor(nodes: NodeData[], edges: EdgeData[]) {
    this.nodes = nodes;
    this.edges = edges;
    this.adjacencyList = new Map();
    this.inDegree = new Map();
    this.nodeMap = new Map();

    this.buildGraph();
  }

  private buildGraph(): void {
    for (const node of this.nodes) {
      this.nodeMap.set(node.id, node);
      this.adjacencyList.set(node.id, []);
      this.inDegree.set(node.id, 0);
    }

    for (const edge of this.edges) {
      const targets = this.adjacencyList.get(edge.source);
      if (targets) {
        targets.push(edge.target);
      }

      const currentDegree = this.inDegree.get(edge.target) || 0;
      this.inDegree.set(edge.target, currentDegree + 1);
    }
  }

  private getTopologicalOrder(): string[] {
    const order: string[] = [];
    const queue: string[] = [];
    const inDegree = new Map(this.inDegree);

    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);

      const neighbors = this.adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (order.length !== this.nodes.length) {
      throw new Error("Workflow contains a cycle - cannot execute");
    }

    return order;
  }

  /**
   * Every step this one can reach backwards, grouped by how many hops away.
   *
   * Index 0 is the direct predecessors, index 1 their predecessors, and so on.
   * A node is only reported at the shortest distance it was reached from, so a
   * diamond-shaped graph counts each ancestor once.
   */
  private ancestorsByDistance(nodeId: string): string[][] {
    const incoming = new Map<string, string[]>();
    for (const edge of this.edges) {
      const list = incoming.get(edge.target) || [];
      list.push(edge.source);
      incoming.set(edge.target, list);
    }

    const levels: string[][] = [];
    const seen = new Set<string>([nodeId]);
    let frontier = (incoming.get(nodeId) || []).filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    while (frontier.length > 0) {
      levels.push(frontier);

      const next: string[] = [];
      for (const id of frontier) {
        for (const parent of incoming.get(id) || []) {
          if (seen.has(parent)) continue;
          seen.add(parent);
          next.push(parent);
        }
      }
      frontier = next;
    }

    return levels;
  }

  /**
   * What a step can see when it runs.
   *
   * A step used to receive only its direct predecessors' output, while the field
   * picker in the editor offered values from every step upstream. So a workflow
   * could be built exactly as the interface described it and still run with
   * `{{themes}}` printed literally into the result, because the step producing
   * `themes` was two hops back rather than one.
   *
   * Everything upstream is now in scope, merged from the farthest ancestor
   * inwards so that nearer steps win a name clash: if a step's own predecessor
   * produces `data`, that is the `data` it gets, not some earlier step's.
   */
  private getNodeInputs(
    nodeId: string,
    context: ExecutionContext
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    const levels = this.ancestorsByDistance(nodeId);
    for (let distance = levels.length - 1; distance >= 0; distance--) {
      for (const ancestorId of levels[distance]) {
        const output = context.nodeOutputs.get(ancestorId);
        if (output) Object.assign(inputs, output);
      }
    }

    // A named handle asks for one specific value, so it is applied last and
    // overrides anything of the same name that arrived by inheritance.
    for (const edge of this.edges.filter((e) => e.target === nodeId)) {
      const sourceOutput = context.nodeOutputs.get(edge.source);
      if (!sourceOutput) continue;

      const key = edge.sourceHandle;
      if (key && key !== "default") {
        inputs[key] = sourceOutput[key] ?? sourceOutput;
      }
    }

    return inputs;
  }

  /**
   * Turn a raw failure into something the person running the workflow can act on.
   *
   * Rules are ordered most-specific first and the first match wins, so a
   * recognisable failure (a retired model, a missing key, a rate limit) produces
   * a precise explanation instead of the generic advice that used to apply to
   * every error alike.
   */
  private analyzeError(
    failedNode: NodeData,
    error: string,
    context: ExecutionContext,
    nodeInputs: Record<string, unknown>
  ): ErrorAnalysis {
    // Steps downstream of the failure never ran.
    const affectedNodes: string[] = [];
    const visited = new Set<string>();
    const queue = [failedNode.id];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const neighbors = this.adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          const node = this.nodeMap.get(neighbor);
          if (node) {
            affectedNodes.push(node.data.label);
            queue.push(neighbor);
          }
        }
      }
    }

    const stepName = failedNode.data.label || failedNode.type;
    const lower = error.toLowerCase();
    const receivedNothing = Object.keys(nodeInputs).length === 0;

    interface Rule {
      when: boolean;
      cause: string;
      fixes: string[];
    }

    const rules: Rule[] = [
      {
        // The most common hard failure: a model that no longer exists.
        when:
          (lower.includes("404") || lower.includes("not_found")) &&
          (lower.includes("model") || failedNode.type === "ai"),
        cause: `The AI model this step is set to use doesn't exist any more.`,
        fixes: [
          `Open "${stepName}" and pick a model from the list.`,
          "Models are retired over time. If this workflow is old, its model may have been withdrawn since you built it.",
        ],
      },
      {
        when:
          lower.includes("401") ||
          lower.includes("403") ||
          lower.includes("api key") ||
          lower.includes("unauthorized") ||
          lower.includes("authentication"),
        cause: "The service refused the request because the key is missing, wrong, or expired.",
        fixes: [
          "Check the key for this service in Settings.",
          "If the key was recently rotated, paste the new one in.",
        ],
      },
      {
        when:
          lower.includes("429") ||
          lower.includes("rate limit") ||
          lower.includes("quota") ||
          lower.includes("too many requests"),
        cause: "You've made too many requests in a short window, or the account is out of credit.",
        fixes: [
          "Wait a minute and run it again.",
          "If this workflow processes a long list, break it into smaller batches.",
          "Check whether the account behind this key still has credit.",
        ],
      },
      {
        when: lower.includes("timed out") || lower.includes("timeout"),
        cause: "The step took longer than the time allowed.",
        fixes: [
          "Run it again, slow services often recover on the next attempt.",
          "If this step handles a lot of data, split the work into smaller pieces.",
        ],
      },
      {
        when:
          lower.includes("private or internal addresses") ||
          lower.includes("ssrf"),
        cause: "That web address points somewhere inside a private network, which isn't allowed.",
        fixes: [
          `Open "${stepName}" and use a public web address.`,
        ],
      },
      {
        when:
          lower.includes("too long and incomplete") ||
          lower.includes("unexpected end") ||
          lower.includes("unterminated"),
        cause: "The AI's answer was cut off before it finished.",
        fixes: [
          "Ask for fewer pieces of information in this step.",
          "Ask for shorter answers in the instruction, for example, add \"keep each answer under a sentence\".",
          "Raise \"Longest reply\" on this step.",
        ],
      },
      {
        when: lower.includes("json") || lower.includes("parse"),
        cause: "The AI's answer didn't come back in the shape this step asked for.",
        fixes: [
          "Simplify what you're asking the AI to give back, fewer named pieces is more reliable.",
          "Make the instruction more specific about what each piece should contain.",
        ],
      },
      {
        when: receivedNothing,
        cause: "This step received nothing from the step before it.",
        fixes: [
          `Check that "${stepName}" is connected to an earlier step.`,
          "Run the earlier step on its own to confirm it produces something.",
        ],
      },
      {
        when:
          lower.includes("needs a list") ||
          lower.includes("array") ||
          lower.includes("list of items"),
        cause: "This step works on a list, but what arrived wasn't a list.",
        fixes: [
          "Check what the previous step produced, click it to see its last result.",
          "If the data comes from a web address, confirm that address returns several items rather than one.",
        ],
      },
      {
        when:
          lower.includes("undefined") ||
          lower.includes("null") ||
          lower.includes("missing"),
        cause: "A value this step needs wasn't there.",
        fixes: [
          `Open "${stepName}" and check every value it refers to still exists.`,
          "Names must match exactly, including capital letters.",
        ],
      },
      {
        when: lower.includes("condition"),
        cause: "The rule on this step couldn't be applied.",
        fixes: [
          `Open "${stepName}" and rebuild the rule using the dropdowns.`,
          "Check that the value the rule compares still comes from an earlier step.",
        ],
      },
      {
        when:
          lower.includes("network") ||
          lower.includes("fetch") ||
          lower.includes("econnrefused") ||
          lower.includes("enotfound"),
        cause: "The service couldn't be reached.",
        fixes: [
          "Check the web address is correct.",
          "The service may be down, try again shortly.",
        ],
      },
    ];

    const matched = rules.find((rule) => rule.when);

    const possibleCauses: string[] = [];
    const suggestedFixes: string[] = [];

    if (matched) {
      possibleCauses.push(matched.cause);
      suggestedFixes.push(...matched.fixes);
    } else {
      possibleCauses.push("Something went wrong in this step that we couldn't identify.");
      suggestedFixes.push(
        `Open "${stepName}" and check its settings.`,
        "Click the step before it to see what it produced.",
        "Try running the workflow again, some failures are temporary."
      );
    }

    let summary = `"${stepName}" couldn't finish.`;
    if (affectedNodes.length === 1) {
      summary += ` The step after it didn't run.`;
    } else if (affectedNodes.length > 1) {
      summary += ` The ${affectedNodes.length} steps after it didn't run.`;
    }

    return {
      summary,
      failedNode: stepName,
      failedNodeType: failedNode.type,
      possibleCauses,
      suggestedFixes,
      affectedNodes,
    };
  }

  async execute(
    input: Record<string, unknown> = {},
    onNodeUpdate?: ExecutionCallback,
    options: { timeoutMs?: number } = {}
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    // Default timeout: 5 minutes (300000ms)
    const timeoutMs = options.timeoutMs ?? 300000;

    const context: ExecutionContext = {
      nodeOutputs: new Map(),
      globalContext: { ...input },
      logs: [],
    };

    // Helper to check if execution has exceeded timeout
    const checkTimeout = () => {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Workflow execution timed out after ${Math.floor(timeoutMs / 1000)} seconds. ` +
          `Consider breaking your workflow into smaller parts or optimizing slow nodes.`
        );
      }
    };

    try {
      const executionOrder = this.getTopologicalOrder();

      for (const nodeId of executionOrder) {
        // Check timeout before each node
        checkTimeout();
        const node = this.nodeMap.get(nodeId);
        if (!node) {
          throw new Error(`Node ${nodeId} not found`);
        }

        const nodeStartTime = Date.now();
        const log: ExecutionLog = {
          nodeId: node.id,
          nodeName: node.data.label,
          status: "running",
          startedAt: new Date().toISOString(),
        };

        context.logs.push(log);

        // Notify that node is starting
        if (onNodeUpdate) {
          onNodeUpdate(log, [...context.logs]);
        }

        let nodeInputs = this.getNodeInputs(nodeId, context);

        if (node.type === "input") {
          nodeInputs = { ...input, ...nodeInputs };
        }

        log.input = nodeInputs;

        const result: NodeResult = await executeNode(node.type, {
          nodeId: node.id,
          inputs: nodeInputs,
          config: node.data.config,
          globalContext: context.globalContext,
        });

        if (!result.success) {
          log.status = "failed";
          log.error = result.error;
          log.completedAt = new Date().toISOString();
          log.duration = Date.now() - nodeStartTime;

          // Notify that node failed
          if (onNodeUpdate) {
            onNodeUpdate(log, [...context.logs]);
          }

          const errorAnalysis = this.analyzeError(
            node,
            result.error || "Unknown error",
            context,
            nodeInputs
          );

          return {
            success: false,
            error: `Node "${node.data.label}" failed: ${result.error}`,
            errorAnalysis,
            logs: context.logs,
            duration: Date.now() - startTime,
          };
        }

        log.status = "completed";
        log.output = result.output;
        log.completedAt = new Date().toISOString();
        log.duration = Date.now() - nodeStartTime;

        // Notify that node completed
        if (onNodeUpdate) {
          onNodeUpdate(log, [...context.logs]);
        }

        context.nodeOutputs.set(nodeId, result.output || {});

        if (result.output) {
          Object.assign(context.globalContext, result.output);
        }
      }

      const outputNodes = this.nodes.filter((n) => n.type === "output");
      let finalOutput: Record<string, unknown> = {};

      if (outputNodes.length > 0) {
        for (const outputNode of outputNodes) {
          const nodeOutput = context.nodeOutputs.get(outputNode.id);
          if (nodeOutput) {
            Object.assign(finalOutput, nodeOutput);
          }
        }
      } else {
        const lastNodeId = executionOrder[executionOrder.length - 1];
        finalOutput = context.nodeOutputs.get(lastNodeId) || {};
      }

      return {
        success: true,
        output: finalOutput,
        logs: context.logs,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: context.logs,
        duration: Date.now() - startTime,
      };
    }
  }
}

export function createExecutor(
  nodes: NodeData[],
  edges: EdgeData[]
): WorkflowExecutor {
  return new WorkflowExecutor(nodes, edges);
}
