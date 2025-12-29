"use client";

import { type NodeProps } from "@xyflow/react";
import { Plug } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function IntegrationNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<Plug className="h-5 w-5" />}
      color="bg-indigo-500"
      gradient="from-indigo-400 to-indigo-600"
    />
  );
}
