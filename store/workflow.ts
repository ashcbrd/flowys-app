import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Node, Edge, Connection, NodeChange, EdgeChange } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react";
import { api, type Workflow, type Execution, type ExecutionLog } from "@/lib/api";

export type NodeType = "input" | "api" | "ai" | "logic" | "output" | "webhook" | "integration";

export interface WorkflowNode extends Node {
  type: NodeType;
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface GeneratedNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface GeneratedEdge {
  id: string;
  source: string;
  target: string;
}

export interface GeneratedWorkflow {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
}

export type WorkflowStatus = "draft" | "saved" | "modified";

interface DraftWorkflow {
  nodes: WorkflowNode[];
  edges: Edge[];
  name?: string;
  lastModified: string;
}

interface HistoryState {
  nodes: WorkflowNode[];
  edges: Edge[];
}

interface WorkflowState {
  nodes: WorkflowNode[];
  edges: Edge[];
  selectedNode: WorkflowNode | null;
  workflow: Workflow | null;
  currentWorkflowId: string | null;
  workflowStatus: WorkflowStatus;
  isExecuting: boolean;
  executionLogs: ExecutionLog[];
  lastExecution: Execution | null;
  isHydrated: boolean;

  // Draft support
  draftWorkflow: DraftWorkflow | null;

  // History for undo/redo
  history: HistoryState[];
  historyIndex: number;
  maxHistorySize: number;

  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;
  deleteNode: (nodeId: string) => void;
  selectNode: (node: WorkflowNode | null) => void;
  loadWorkflow: (id: string) => Promise<void>;
  saveWorkflow: (name: string, description?: string) => Promise<void>;
  executeWorkflow: (input?: Record<string, unknown>) => Promise<void>;
  clearCanvas: () => void;
  newWorkflow: () => void;
  createWorkflow: (workflow: GeneratedWorkflow) => void;
  hydrateFromStorage: () => Promise<void>;
  saveDraft: () => void;
  loadDraft: () => boolean;
  clearDraft: () => void;
  hasDraft: () => boolean;
  getWorkflowStatus: () => WorkflowStatus;

  // Undo/Redo
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Layout
  beautifyLayout: () => void;
  hasConnectedNodes: () => boolean;

  // Export/Import
  exportWorkflow: () => void;
  importWorkflow: (file: File) => Promise<void>;
}

const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const defaultConfigs: Record<NodeType, Record<string, unknown>> = {
  input: {
    fields: [
      { name: "text", type: "string", required: true },
    ],
  },
  api: {
    url: "",
    method: "GET",
    headers: {},
  },
  ai: {
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt: "You are a helpful assistant. Provide concise, accurate responses.",
    userPromptTemplate: "{{text}}",
    temperature: 0.7,
    maxTokens: 4096,
    outputSchema: {
      type: "object",
      properties: {
        response: { type: "string", description: "The AI response" },
      },
      required: ["response"],
    },
  },
  logic: {
    operation: "passthrough",
  },
  output: {
    format: "json",
  },
  webhook: {
    url: "",
    method: "POST",
    headers: {},
    timeout: 30000,
    continueOnError: false,
  },
  integration: {
    connectionId: "",
    connectionName: "",
    integrationId: "",
    integrationName: "",
    actionId: "",
    actionName: "",
    input: {},
  },
};

const nodeLabels: Record<NodeType, string> = {
  input: "Input",
  api: "API Fetch",
  ai: "AI / LLM",
  logic: "Logic",
  output: "Output",
  webhook: "Webhook",
  integration: "Integration",
};

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNode: null,
      workflow: null,
      currentWorkflowId: null,
      workflowStatus: "draft" as WorkflowStatus,
      isExecuting: false,
      executionLogs: [],
      lastExecution: null,
      isHydrated: false,

      // Draft support
      draftWorkflow: null,

      // History state
      history: [],
      historyIndex: -1,
      maxHistorySize: 50,

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      pushHistory: () => {
        const { nodes, edges, history, historyIndex, maxHistorySize } = get();
        // Slice history to current index (discard any redo states)
        const newHistory = history.slice(0, historyIndex + 1);
        // Add current state
        newHistory.push({
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
        });
        // Limit history size
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
        }
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },

      undo: () => {
        const { history, historyIndex, nodes, edges } = get();
        if (historyIndex < 0) return;

        // If at the end, save current state first
        if (historyIndex === history.length - 1) {
          const newHistory = [...history];
          newHistory.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
          });
          set({ history: newHistory });
        }

        const prevState = history[historyIndex];
        if (prevState) {
          set({
            nodes: prevState.nodes,
            edges: prevState.edges,
            historyIndex: historyIndex - 1,
            selectedNode: null,
          });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        const nextIndex = historyIndex + 2;
        if (nextIndex >= history.length) return;

        const nextState = history[nextIndex];
        if (nextState) {
          set({
            nodes: nextState.nodes,
            edges: nextState.edges,
            historyIndex: historyIndex + 1,
            selectedNode: null,
          });
        }
      },

      canUndo: () => {
        const { historyIndex } = get();
        return historyIndex >= 0;
      },

      canRedo: () => {
        const { history, historyIndex } = get();
        return historyIndex + 2 < history.length;
      },

      hasConnectedNodes: () => {
        const { edges } = get();
        return edges.length > 0;
      },

      beautifyLayout: () => {
        const { nodes, edges, setNodes, pushHistory } = get();
        if (nodes.length === 0) return;

        pushHistory();

        // Build adjacency list and in-degree map
        const adjList = new Map<string, string[]>();
        const inDegree = new Map<string, number>();

        nodes.forEach((node) => {
          adjList.set(node.id, []);
          inDegree.set(node.id, 0);
        });

        edges.forEach((edge) => {
          adjList.get(edge.source)?.push(edge.target);
          inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        });

        // Topological sort with layers
        const layers: string[][] = [];
        let currentLayer = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);

        while (currentLayer.length > 0) {
          layers.push(currentLayer);
          const nextLayer: string[] = [];

          currentLayer.forEach((nodeId) => {
            adjList.get(nodeId)?.forEach((targetId) => {
              const newDegree = (inDegree.get(targetId) || 0) - 1;
              inDegree.set(targetId, newDegree);
              if (newDegree === 0) {
                nextLayer.push(targetId);
              }
            });
          });

          currentLayer = nextLayer;
        }

        // Handle any remaining nodes (cycles or unconnected)
        const placedNodes = new Set(layers.flat());
        const unplacedNodes = nodes.filter((n) => !placedNodes.has(n.id)).map((n) => n.id);
        if (unplacedNodes.length > 0) {
          layers.push(unplacedNodes);
        }

        // Calculate positions
        const nodeWidth = 220;
        const nodeHeight = 100;
        const horizontalGap = 100;
        const verticalGap = 60;

        const newPositions = new Map<string, { x: number; y: number }>();

        layers.forEach((layer, layerIndex) => {
          const layerHeight = layer.length * nodeHeight + (layer.length - 1) * verticalGap;
          const startY = -layerHeight / 2;

          layer.forEach((nodeId, nodeIndex) => {
            newPositions.set(nodeId, {
              x: layerIndex * (nodeWidth + horizontalGap),
              y: startY + nodeIndex * (nodeHeight + verticalGap),
            });
          });
        });

        const layoutedNodes = nodes.map((node) => ({
          ...node,
          position: newPositions.get(node.id) || node.position,
        }));

        setNodes(layoutedNodes);
      },

      exportWorkflow: () => {
        const { nodes, edges, workflow } = get();
        const name = workflow?.name || "Untitled Workflow";
        const description = workflow?.description;

        // Dynamic import to avoid SSR issues
        import("@/lib/workflow-io").then(({ createWorkflowExport, workflowToJson, downloadWorkflow }) => {
          const exportData = createWorkflowExport(name, description, nodes, edges);
          const json = workflowToJson(exportData);
          downloadWorkflow(name, json);
        });
      },

      importWorkflow: async (file: File) => {
        const { setNodes, setEdges, pushHistory, clearDraft } = get();

        const { readFileAsText, parseWorkflowImport, remapWorkflowIds } = await import("@/lib/workflow-io");

        const text = await readFileAsText(file);
        const importData = parseWorkflowImport(text);

        // Generate new IDs to avoid conflicts
        const { nodes: newNodes, edges: newEdges } = remapWorkflowIds(
          importData.workflow.nodes,
          importData.workflow.edges
        );

        // Push current state to history before replacing
        pushHistory();

        // Set the imported workflow
        setNodes(newNodes);
        setEdges(newEdges);

        // Clear any existing draft and update state
        clearDraft();
        set({
          workflow: {
            id: "",
            name: importData.workflow.name,
            description: importData.workflow.description,
            nodes: newNodes,
            edges: newEdges,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          currentWorkflowId: null,
          workflowStatus: "draft",
        });
      },

      onNodesChange: (changes) => {
        // Check if this is a structural change (not just position/selection)
        const isStructuralChange = changes.some(
          (c) => c.type === "remove" || c.type === "add"
        );
        if (isStructuralChange) {
          get().pushHistory();
        }
        const newNodes = applyNodeChanges(changes, get().nodes) as WorkflowNode[];
        const { workflow, workflowStatus } = get();
        set({
          nodes: newNodes,
          workflowStatus: workflow ? "modified" : workflowStatus,
        });
        // Auto-save draft on structural changes
        if (isStructuralChange) {
          get().saveDraft();
        }
      },

      onEdgesChange: (changes) => {
        const isStructuralChange = changes.some(
          (c) => c.type === "remove" || c.type === "add"
        );
        if (isStructuralChange) {
          get().pushHistory();
        }
        const newEdges = applyEdgeChanges(changes, get().edges);
        const { workflow, workflowStatus } = get();
        set({
          edges: newEdges,
          workflowStatus: workflow ? "modified" : workflowStatus,
        });
        // Auto-save draft on structural changes
        if (isStructuralChange) {
          get().saveDraft();
        }
      },

      onConnect: (connection) => {
        get().pushHistory();
        const { workflow, workflowStatus } = get();
        set({
          edges: addEdge(
            { ...connection, id: `edge_${Date.now()}` },
            get().edges
          ),
          workflowStatus: workflow ? "modified" : workflowStatus,
        });
        get().saveDraft();
      },

      addNode: (type, position) => {
        get().pushHistory();
        const id = generateId();
        const newNode: WorkflowNode = {
          id,
          type,
          position,
          data: {
            label: nodeLabels[type],
            config: { ...defaultConfigs[type] },
          },
        };
        const { workflow, workflowStatus } = get();
        set({
          nodes: [...get().nodes, newNode],
          workflowStatus: workflow ? "modified" : workflowStatus,
        });
        get().saveDraft();
      },

      updateNodeConfig: (nodeId, config) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, config } }
              : node
          ),
        });

        const selectedNode = get().selectedNode;
        if (selectedNode?.id === nodeId) {
          set({
            selectedNode: {
              ...selectedNode,
              data: { ...selectedNode.data, config },
            },
          });
        }
      },

      updateNodeLabel: (nodeId, label) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, label } }
              : node
          ),
        });
      },

      deleteNode: (nodeId) => {
        get().pushHistory();
        set({
          nodes: get().nodes.filter((node) => node.id !== nodeId),
          edges: get().edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
          selectedNode:
            get().selectedNode?.id === nodeId ? null : get().selectedNode,
        });
      },

      selectNode: (node) => set({ selectedNode: node }),

      loadWorkflow: async (id) => {
        const workflow = await api.workflows.get(id);
        set({
          workflow,
          currentWorkflowId: workflow.id,
          nodes: workflow.nodes as WorkflowNode[],
          edges: workflow.edges,
          selectedNode: null,
          workflowStatus: "saved",
          history: [],
          historyIndex: -1,
          draftWorkflow: null,
        });
      },

      saveWorkflow: async (name, description) => {
        const { nodes, edges, workflow } = get();

        const data = {
          name,
          description,
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type as NodeType,
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
          })),
        };

        if (workflow) {
          const updated = await api.workflows.update(workflow.id, data);
          set({
            workflow: updated,
            currentWorkflowId: updated.id,
            workflowStatus: "saved",
            draftWorkflow: null,
          });
        } else {
          const created = await api.workflows.create(data);
          set({
            workflow: created,
            currentWorkflowId: created.id,
            workflowStatus: "saved",
            draftWorkflow: null,
          });
        }
      },

      executeWorkflow: async (input) => {
        const { workflow, nodes, edges } = get();
        set({ isExecuting: true, executionLogs: [], lastExecution: null });

        // Dispatch event to open execution drawer
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("execution-started"));
        }

        try {
          let workflowId = workflow?.id;

          if (!workflowId) {
            const tempWorkflow = await api.workflows.create({
              name: "Untitled Workflow",
              nodes: nodes.map((n) => ({
                id: n.id,
                type: n.type as NodeType,
                position: n.position,
                data: n.data,
              })),
              edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle ?? undefined,
                targetHandle: e.targetHandle ?? undefined,
              })),
            });
            workflowId = tempWorkflow.id;
            set({ workflow: tempWorkflow, currentWorkflowId: tempWorkflow.id });
          }

          // Use streaming endpoint for real-time updates
          const response = await fetch(`/api/workflows/${workflowId}/execute/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input,
              nodes: nodes.map((n) => ({
                id: n.id,
                type: n.type as NodeType,
                position: n.position,
                data: n.data,
              })),
              edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle ?? undefined,
                targetHandle: e.targetHandle ?? undefined,
              })),
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to start execution");
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;

              const eventMatch = line.match(/^event: (.+)$/m);
              const dataMatch = line.match(/^data: (.+)$/m);

              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                const data = JSON.parse(dataMatch[1]);

                switch (eventType) {
                  case "node-update":
                    set({ executionLogs: data.logs });
                    break;
                  case "completed":
                    set({
                      lastExecution: data,
                      executionLogs: data.logs || [],
                      isExecuting: false,
                    });
                    // Dispatch event to update credits display
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("credits-updated"));
                    }
                    break;
                  case "error":
                    set({ isExecuting: false });
                    throw new Error(data.error || "Execution failed");
                }
              }
            }
          }
        } catch (error) {
          set({ isExecuting: false });
          throw error;
        }
      },

      clearCanvas: () => {
        get().pushHistory();
        set({
          nodes: [],
          edges: [],
          selectedNode: null,
          executionLogs: [],
          lastExecution: null,
        });
      },

      newWorkflow: () => {
        set({
          nodes: [],
          edges: [],
          selectedNode: null,
          workflow: null,
          currentWorkflowId: null,
          workflowStatus: "draft",
          executionLogs: [],
          lastExecution: null,
          history: [],
          historyIndex: -1,
          draftWorkflow: null,
        });
      },

      createWorkflow: (workflow: GeneratedWorkflow) => {
        const newNodes: WorkflowNode[] = workflow.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          position: node.position,
          data: {
            label: node.data.label,
            config: node.data.config,
          },
        }));

        const newEdges: Edge[] = workflow.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        }));

        set({
          nodes: newNodes,
          edges: newEdges,
          selectedNode: null,
          workflow: null,
          currentWorkflowId: null,
          executionLogs: [],
          lastExecution: null,
        });
      },

      saveDraft: () => {
        const { nodes, edges, workflow } = get();
        // Only save draft if there are nodes and it's not a saved workflow
        if (nodes.length > 0 && !workflow) {
          set({
            draftWorkflow: {
              nodes: JSON.parse(JSON.stringify(nodes)),
              edges: JSON.parse(JSON.stringify(edges)),
              lastModified: new Date().toISOString(),
            },
          });
        }
      },

      loadDraft: () => {
        const { draftWorkflow } = get();
        if (draftWorkflow && draftWorkflow.nodes.length > 0) {
          set({
            nodes: draftWorkflow.nodes,
            edges: draftWorkflow.edges,
            workflowStatus: "draft",
            workflow: null,
            currentWorkflowId: null,
          });
          return true;
        }
        return false;
      },

      clearDraft: () => {
        set({ draftWorkflow: null });
      },

      hasDraft: () => {
        const { draftWorkflow } = get();
        return !!(draftWorkflow && draftWorkflow.nodes.length > 0);
      },

      getWorkflowStatus: () => {
        return get().workflowStatus;
      },

      hydrateFromStorage: async () => {
        const { currentWorkflowId, draftWorkflow, isHydrated } = get();
        if (isHydrated) return;

        set({ isHydrated: true });

        // Priority: Load saved workflow if exists, otherwise load draft
        if (currentWorkflowId) {
          try {
            const workflow = await api.workflows.get(currentWorkflowId);
            set({
              workflow,
              nodes: workflow.nodes as WorkflowNode[],
              edges: workflow.edges,
              workflowStatus: "saved",
            });
          } catch {
            // Workflow might have been deleted, try loading draft
            set({ currentWorkflowId: null });
            if (draftWorkflow && draftWorkflow.nodes.length > 0) {
              set({
                nodes: draftWorkflow.nodes,
                edges: draftWorkflow.edges,
                workflowStatus: "draft",
              });
            }
          }
        } else if (draftWorkflow && draftWorkflow.nodes.length > 0) {
          // No saved workflow, load draft if exists
          set({
            nodes: draftWorkflow.nodes,
            edges: draftWorkflow.edges,
            workflowStatus: "draft",
          });
        }
      },
    }),
    {
      name: "flowys-workflow-storage",
      partialize: (state) => ({
        currentWorkflowId: state.currentWorkflowId,
        draftWorkflow: state.draftWorkflow,
      }),
    }
  )
);
