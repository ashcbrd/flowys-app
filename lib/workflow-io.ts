import type { Edge } from "@xyflow/react";
import type { WorkflowNode } from "@/store/workflow";
import type { EdgeData } from "@/lib/api";

// Export format version for future compatibility
export const WORKFLOW_EXPORT_VERSION = 1;

export interface WorkflowExportData {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: Edge[];
}

export interface WorkflowExport {
  version: number;
  exportedAt: string;
  workflow: WorkflowExportData;
}

/**
 * Creates an export object from workflow data
 */
export function createWorkflowExport(
  name: string,
  description: string | undefined,
  nodes: WorkflowNode[],
  edges: Edge[]
): WorkflowExport {
  return {
    version: WORKFLOW_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    workflow: {
      name,
      description,
      nodes,
      edges,
    },
  };
}

/**
 * Converts workflow export to JSON string
 */
export function workflowToJson(exportData: WorkflowExport): string {
  return JSON.stringify(exportData, null, 2);
}

/**
 * Triggers a file download in the browser
 */
export function downloadWorkflow(name: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  // Sanitize filename
  const filename = name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  link.href = url;
  link.download = `${filename}.json`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses and validates imported workflow JSON
 */
export function parseWorkflowImport(jsonString: string): WorkflowExport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid JSON format");
  }

  // Validate structure
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid workflow format");
  }

  const data = parsed as Record<string, unknown>;

  // Check version
  if (typeof data.version !== "number") {
    throw new Error("Missing or invalid version number");
  }

  // Check workflow object
  if (!data.workflow || typeof data.workflow !== "object") {
    throw new Error("Missing workflow data");
  }

  const workflow = data.workflow as Record<string, unknown>;

  // Validate required fields
  if (typeof workflow.name !== "string" || !workflow.name.trim()) {
    throw new Error("Missing or invalid workflow name");
  }

  if (!Array.isArray(workflow.nodes)) {
    throw new Error("Missing or invalid nodes array");
  }

  if (!Array.isArray(workflow.edges)) {
    throw new Error("Missing or invalid edges array");
  }

  // Validate nodes have required fields
  for (const node of workflow.nodes) {
    if (!node.id || !node.type || !node.position || !node.data) {
      throw new Error("Invalid node structure: missing required fields");
    }
  }

  // Validate edges have required fields
  for (const edge of workflow.edges) {
    if (!edge.id || !edge.source || !edge.target) {
      throw new Error("Invalid edge structure: missing required fields");
    }
  }

  return {
    version: data.version as number,
    exportedAt: (data.exportedAt as string) || new Date().toISOString(),
    workflow: {
      name: workflow.name as string,
      description: workflow.description as string | undefined,
      nodes: workflow.nodes as WorkflowNode[],
      edges: workflow.edges as Edge[],
    },
  };
}

/**
 * Generates new unique IDs for nodes and edges, remapping edge references
 */
export function remapWorkflowIds(
  nodes: WorkflowNode[],
  edges: Edge[]
): { nodes: WorkflowNode[]; edges: EdgeData[] } {
  const timestamp = Date.now();
  const idMap = new Map<string, string>();

  // Generate new node IDs
  const newNodes = nodes.map((node, index) => {
    const newId = `${node.type}_${timestamp}_${index}`;
    idMap.set(node.id, newId);
    return {
      ...node,
      id: newId,
    };
  });

  // Remap edge references to new node IDs
  // Convert null handles to undefined for type compatibility with EdgeData
  const newEdges: EdgeData[] = edges.map((edge, index) => ({
    id: `edge_${timestamp}_${index}`,
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
  }));

  return { nodes: newNodes, edges: newEdges };
}

/**
 * Reads a File object and returns its text content
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
