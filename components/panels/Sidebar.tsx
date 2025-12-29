"use client";

import { useState } from "react";
import { FileInput, Globe, Sparkles, GitBranch, FileOutput, ChevronLeft, ChevronRight, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nodeTypes = [
  {
    type: "input",
    label: "Input",
    description: "Accept workflow input",
    icon: FileInput,
    color: "bg-green-600",
  },
  {
    type: "api",
    label: "API Fetch",
    description: "Fetch data from APIs",
    icon: Globe,
    color: "bg-blue-600",
  },
  {
    type: "ai",
    label: "AI / LLM",
    description: "Execute AI prompts",
    icon: Sparkles,
    color: "bg-purple-600",
  },
  {
    type: "logic",
    label: "Logic",
    description: "Filter, map, transform",
    icon: GitBranch,
    color: "bg-orange-600",
  },
  {
    type: "output",
    label: "Output",
    description: "Return final result",
    icon: FileOutput,
    color: "bg-red-600",
  },
  {
    type: "integration",
    label: "Integration",
    description: "Connect third-party apps",
    icon: Plug,
    color: "bg-violet-600",
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside
      className={cn(
        "border-r bg-card overflow-y-auto transition-all duration-300 relative",
        collapsed ? "w-16 p-2" : "w-64 p-4"
      )}
    >
      {/* Collapse/Expand Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "absolute top-2 z-10 h-6 w-6 p-0",
          collapsed ? "right-2" : "right-2"
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </Button>

      {!collapsed && (
        <h2 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide mt-6">
          Nodes
        </h2>
      )}

      <div className={cn("space-y-2", collapsed && "mt-10")}>
        {nodeTypes.map((node) => (
          <div
            key={node.type}
            draggable
            onDragStart={(e) => onDragStart(e, node.type)}
            title={collapsed ? `${node.label}: ${node.description}` : undefined}
            className={cn(
              "flex items-center rounded-lg border cursor-grab",
              "hover:border-primary hover:bg-accent transition-colors",
              "active:cursor-grabbing",
              collapsed ? "p-2 justify-center" : "gap-3 p-3"
            )}
          >
            <div className={cn("p-2 rounded-md", node.color)}>
              <node.icon className="h-4 w-4 text-white" />
            </div>
            {!collapsed && (
              <div>
                <p className="font-medium text-sm">{node.label}</p>
                <p className="text-xs text-muted-foreground">{node.description}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {!collapsed && (
        <div className="mt-8">
          <h2 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">
            Instructions
          </h2>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>1. Drag nodes onto the canvas</p>
            <p>2. Connect nodes by dragging from handles</p>
            <p>3. Click a node to configure it</p>
            <p>4. Click Run to execute the workflow</p>
          </div>
        </div>
      )}
    </aside>
  );
}
