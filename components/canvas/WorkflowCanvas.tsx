"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type OnConnect,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkflowStore, type WorkflowNode } from "@/store/workflow";
import { InputNode } from "@/components/nodes/InputNode";
import { ApiNode } from "@/components/nodes/ApiNode";
import { AiNode } from "@/components/nodes/AiNode";
import { LogicNode } from "@/components/nodes/LogicNode";
import { OutputNode } from "@/components/nodes/OutputNode";
import { IntegrationNode } from "@/components/nodes/IntegrationNode";
import { WebhookNode } from "@/components/nodes/WebhookNode";
import { useToast } from "@/hooks/use-toast";

type PlanType = "free" | "builder" | "team";

// Node limits per plan
const NODE_LIMITS: Record<PlanType, number> = {
  free: 4,
  builder: 25,
  team: -1, // Unlimited
};

const nodeTypes = {
  input: InputNode,
  api: ApiNode,
  ai: AiNode,
  logic: LogicNode,
  output: OutputNode,
  integration: IntegrationNode,
  webhook: WebhookNode,
};

function WorkflowCanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    addNode,
  } = useWorkflowStore();
  const { toast } = useToast();
  const [userPlan, setUserPlan] = useState<PlanType>("free");

  // Fetch user's subscription plan
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const data = await res.json();
          setUserPlan(data.subscription?.plan || "free");
        }
      } catch {
        setUserPlan("free");
      }
    };
    fetchPlan();
  }, []);

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      onConnect(connection);
    },
    [onConnect]
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      selectNode(node as WorkflowNode);
    },
    [selectNode]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      // Check node limit for current plan
      const nodeLimit = NODE_LIMITS[userPlan];
      if (nodeLimit !== -1 && nodes.length >= nodeLimit) {
        const planName = userPlan === "free" ? "Free" : "Builder";
        const upgradeTo = userPlan === "free" ? "Builder" : "Team";
        toast({
          title: "Node Limit Reached",
          description: `${planName} plan allows up to ${nodeLimit} nodes per workflow. Upgrade to ${upgradeTo} for more.`,
          variant: "destructive",
        });
        return;
      }

      // Convert screen coordinates to flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Offset to center the node on cursor
      const adjustedPosition = {
        x: position.x - 110, // Half of node width (~220)
        y: position.y - 40,  // Approximate offset for node header
      };

      addNode(type as "input" | "api" | "ai" | "logic" | "output" | "integration" | "webhook", adjustedPosition);
    },
    [addNode, screenToFlowPosition, nodes.length, userPlan, toast]
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
        }}
      >
        <Background gap={15} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}
