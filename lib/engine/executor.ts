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

  private getNodeInputs(
    nodeId: string,
    context: ExecutionContext
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    const incomingEdges = this.edges.filter((e) => e.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceOutput = context.nodeOutputs.get(edge.source);
      if (sourceOutput) {
        const key = edge.sourceHandle || "default";
        if (key === "default") {
          Object.assign(inputs, sourceOutput);
        } else {
          inputs[key] = sourceOutput[key] ?? sourceOutput;
        }
      }
    }

    return inputs;
  }

  private analyzeError(
    failedNode: NodeData,
    error: string,
    context: ExecutionContext,
    nodeInputs: Record<string, unknown>
  ): ErrorAnalysis {
    const possibleCauses: string[] = [];
    const suggestedFixes: string[] = [];

    // Find nodes that depend on the failed node
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

    // Analyze based on node type and error message
    const errorLower = error.toLowerCase();

    // Input/Data issues
    if (errorLower.includes("array") || errorLower.includes("list")) {
      possibleCauses.push("The previous node didn't return data in the expected format (array/list)");
      suggestedFixes.push("Check the output of the previous node - click on it to see what data it produced");
      suggestedFixes.push("If using an API node, verify the API returns an array of items");
    }

    if (errorLower.includes("undefined") || errorLower.includes("null") || errorLower.includes("missing")) {
      possibleCauses.push("Required data is missing from the input");
      suggestedFixes.push("Make sure all required fields are being passed from previous nodes");
      suggestedFixes.push("Check if the field names match exactly (including capitalization)");
    }

    // Connection issues
    if (errorLower.includes("api") || errorLower.includes("fetch") || errorLower.includes("network")) {
      possibleCauses.push("Unable to connect to an external service or API");
      suggestedFixes.push("Check your internet connection");
      suggestedFixes.push("Verify the API URL is correct and the service is running");
      suggestedFixes.push("Check if any API keys are required and properly configured");
    }

    // AI/Model issues
    if (errorLower.includes("ai") || errorLower.includes("model") || errorLower.includes("token")) {
      possibleCauses.push("Issue with the AI model configuration or response");
      suggestedFixes.push("Try simplifying your prompt or reducing the expected output size");
      suggestedFixes.push("Check that your API key is valid and has sufficient credits");
      suggestedFixes.push("Try using a different model (e.g., gpt-4o-mini for faster, cheaper responses)");
    }

    if (errorLower.includes("json") || errorLower.includes("parse")) {
      possibleCauses.push("The AI response wasn't in the expected JSON format");
      suggestedFixes.push("Simplify your output schema to reduce complexity");
      suggestedFixes.push("Increase the max tokens setting to prevent cut-off responses");
      suggestedFixes.push("Add clearer instructions in your prompt about the expected format");
    }

    // Configuration issues
    if (errorLower.includes("config") || errorLower.includes("setting") || errorLower.includes("mapping")) {
      possibleCauses.push("The node is not properly configured");
      suggestedFixes.push("Click on the node to review and update its settings");
      suggestedFixes.push("Make sure all required fields are filled in");
    }

    if (errorLower.includes("condition")) {
      possibleCauses.push("The filter/condition expression may be incorrect");
      suggestedFixes.push("Check the condition syntax - use format like 'item.score > 80'");
      suggestedFixes.push("Make sure the field names in your condition exist in the data");
    }

    // Type-specific suggestions
    if (failedNode.type === "api") {
      if (!possibleCauses.length) {
        possibleCauses.push("The API request may have failed or returned unexpected data");
      }
      suggestedFixes.push("Test the API endpoint separately to verify it works");
      suggestedFixes.push("Check the API node's URL, method, and headers configuration");
    }

    if (failedNode.type === "ai") {
      if (!possibleCauses.length) {
        possibleCauses.push("The AI model may have encountered an issue processing your request");
      }
      suggestedFixes.push("Review your prompt template and make it clearer");
      suggestedFixes.push("Check that variable placeholders like {{data}} match available inputs");
    }

    if (failedNode.type === "logic") {
      if (!possibleCauses.length) {
        possibleCauses.push("The data transformation or filtering logic encountered an issue");
      }
      suggestedFixes.push("Verify the input data structure matches what the operation expects");
      suggestedFixes.push("For filter operations, ensure the condition references valid fields");
    }

    // Check for empty inputs
    if (Object.keys(nodeInputs).length === 0) {
      possibleCauses.unshift("This node received no input data from previous nodes");
      suggestedFixes.unshift("Make sure this node is connected to a previous node that outputs data");
    }

    // Default suggestions if none were added
    if (possibleCauses.length === 0) {
      possibleCauses.push("An unexpected error occurred during execution");
    }

    if (suggestedFixes.length === 0) {
      suggestedFixes.push("Review the node configuration by clicking on it");
      suggestedFixes.push("Check the output of previous nodes for unexpected data");
      suggestedFixes.push("Try running the workflow again - some errors are temporary");
    }

    // Generate summary
    let summary = `The "${failedNode.data.label}" node (${failedNode.type}) failed to execute. `;
    if (affectedNodes.length > 0) {
      summary += `This also prevented ${affectedNodes.length} other node(s) from running.`;
    }

    return {
      summary,
      failedNode: failedNode.data.label,
      failedNodeType: failedNode.type,
      possibleCauses,
      suggestedFixes,
      affectedNodes,
    };
  }

  async execute(
    input: Record<string, unknown> = {},
    onNodeUpdate?: ExecutionCallback
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const context: ExecutionContext = {
      nodeOutputs: new Map(),
      globalContext: { ...input },
      logs: [],
    };

    try {
      const executionOrder = this.getTopologicalOrder();

      for (const nodeId of executionOrder) {
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
