/**
 * Available Field Derivation
 *
 * Works out which values a node can reference, by walking the graph backwards
 * from that node, the same reverse traversal the executor performs when it
 * gathers a node's inputs.
 *
 * Each upstream node contributes whatever it declares in its own config. Where a
 * node declares nothing, the keys of its most recent actual output are used
 * instead, which is why the picker gets noticeably better after a first test run.
 */

import type { Edge } from "@xyflow/react";
import type { WorkflowNode } from "@/store/workflow";
import { humanizeFieldName } from "@/lib/vocabulary";
import { extractTokens } from "@/lib/utils/template";

export interface AvailableField {
  /** The path written into the template token, e.g. `customerEmail`. */
  path: string;
  /** What the user reads, e.g. "Customer email". */
  label: string;
  /** Which node it came from, e.g. "Step 2 · Ask for details". */
  source: string;
  /** Best-known type, for filtering operators. */
  type?: string;
  /** True when derived from a real execution rather than declared config. */
  fromExecution?: boolean;
}

type NodeOutputKeys = { path: string; type?: string }[];

/** What a node declares it will output, based on its own config. */
function declaredOutputs(node: WorkflowNode): NodeOutputKeys {
  const config = node.data.config || {};

  switch (node.type) {
    case "input": {
      const fields = config.fields as
        | { name: string; type?: string }[]
        | undefined;
      return (fields || [])
        .filter((f) => f?.name)
        .map((f) => ({ path: f.name, type: f.type }));
    }

    case "ai": {
      const schema = config.outputSchema as
        | { properties?: Record<string, { type?: string }> }
        | undefined;
      const properties = schema?.properties || {};
      return Object.entries(properties).map(([name, prop]) => ({
        path: name,
        type: prop?.type,
      }));
    }

    case "api": {
      const mapping = config.responseMapping as
        | Record<string, string>
        | undefined;
      if (mapping && Object.keys(mapping).length > 0) {
        return Object.keys(mapping).map((name) => ({ path: name }));
      }
      // Unmapped API nodes expose the raw response.
      return [
        { path: "data" },
        { path: "status", type: "number" },
      ];
    }

    case "logic": {
      const operation = config.operation as string | undefined;
      const mappings = config.mappings as Record<string, string> | undefined;

      if (operation === "transform" && mappings) {
        return Object.keys(mappings).map((name) => ({ path: name }));
      }
      if (
        operation === "filter" ||
        operation === "map" ||
        operation === "sort" ||
        operation === "slice"
      ) {
        return [
          { path: "data" },
          { path: "count", type: "number" },
        ];
      }
      return [{ path: "data" }];
    }

    case "integration":
      return [{ path: "data" }];

    default:
      return [];
  }
}

/** A stable, human-facing name for a node. */
function nodeLabel(node: WorkflowNode, position: number): string {
  const name = node.data.label?.trim();
  return name ? `Step ${position} · ${name}` : `Step ${position}`;
}

/**
 * Every node that can reach `targetId`, nearest first. Breadth-first over
 * reversed edges, so a diamond-shaped graph reports each ancestor once.
 */
function ancestorsOf(targetId: string, edges: Edge[]): string[] {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target) || [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }

  const ordered: string[] = [];
  const seen = new Set<string>([targetId]);
  const queue = [...(incoming.get(targetId) || [])];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    queue.push(...(incoming.get(id) || []));
  }

  return ordered;
}

/**
 * Fields a node can reference. `executionOutputs` is optional and maps node id
 * to the output that node actually produced on the last run.
 */
export function availableFieldsFor(
  targetId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
  executionOutputs?: Map<string, Record<string, unknown>>
): AvailableField[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positions = new Map(nodes.map((n, i) => [n.id, i + 1]));

  const fields: AvailableField[] = [];
  const seenPaths = new Set<string>();

  for (const id of ancestorsOf(targetId, edges)) {
    const node = byId.get(id);
    if (!node) continue;

    const source = nodeLabel(node, positions.get(id) ?? 0);

    let outputs = declaredOutputs(node);
    let fromExecution = false;

    // Fall back to what the node actually produced last run.
    if (outputs.length === 0) {
      const actual = executionOutputs?.get(id);
      if (actual) {
        outputs = Object.keys(actual).map((path) => ({ path }));
        fromExecution = true;
      }
    }

    for (const output of outputs) {
      if (seenPaths.has(output.path)) continue;
      seenPaths.add(output.path);
      fields.push({
        path: output.path,
        label: humanizeFieldName(output.path),
        source,
        type: output.type,
        fromExecution,
      });
    }
  }

  return fields;
}

/**
 * Logic nodes that iterate a list evaluate conditions against each `item`, so
 * their conditions reference `item.<field>` rather than a bare field name.
 */
export function itemFieldsFor(
  targetId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
  executionOutputs?: Map<string, Record<string, unknown>>
): AvailableField[] {
  const upstream = availableFieldsFor(targetId, nodes, edges, executionOutputs);

  // Sample the first list found in a previous execution to learn item shape.
  const listSample = (() => {
    if (!executionOutputs) return null;
    for (const output of executionOutputs.values()) {
      for (const value of Object.values(output)) {
        if (Array.isArray(value) && value.length > 0) {
          const first = value[0];
          if (first && typeof first === "object") {
            return first as Record<string, unknown>;
          }
        }
      }
    }
    return null;
  })();

  if (listSample) {
    return Object.keys(listSample).map((key) => ({
      path: `item.${key}`,
      label: humanizeFieldName(key),
      source: "Each item in the list",
      fromExecution: true,
    }));
  }

  // Without a sample, offer the upstream names prefixed for item access.
  return upstream.map((f) => ({
    ...f,
    path: `item.${f.path}`,
    source: "Each item in the list",
  }));
}

/**
 * Steps whose config refers to a value nothing upstream produces.
 *
 * The assistant writes both the steps and the report that quotes them, and it
 * does not always use the same names in both. When it does not, the report comes
 * out with a heading and nothing under it, which is how "{{themes}}" ended up
 * printed in a finished result.
 *
 * The question asked here is exactly the one the editor's field picker asks, so
 * the three views of a workflow agree: the picker, this check, and the engine.
 */
export function unresolvedReferences(
  nodes: unknown[],
  edges: unknown[]
): { id: string; label: string; missing: string[]; available: string[] }[] {
  const typed = nodes as WorkflowNode[];
  const problems: {
    id: string;
    label: string;
    missing: string[];
    available: string[];
  }[] = [];

  for (const node of typed) {
    const tokens = new Set(
      extractTokens(JSON.stringify(node?.data?.config ?? {}))
    );
    if (tokens.size === 0) continue;

    const available = availableFieldsFor(node.id, typed, edges as Edge[]).map(
      (f) => f.path
    );
    const availableSet = new Set(available);

    // A nested path resolves through its root, so compare on the root name.
    const missing = [...tokens].filter(
      (token) => !availableSet.has(token.split(".")[0])
    );

    if (missing.length > 0) {
      problems.push({
        id: node.id,
        label: node.data?.label || node.id,
        missing,
        available,
      });
    }
  }

  return problems;
}
