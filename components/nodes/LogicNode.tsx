"use client";

import { type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function LogicNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<GitBranch className="h-5 w-5" />}
      color="bg-amber-500"
      gradient="from-amber-400 to-amber-600"
    />
  );
}
