"use client";

import { type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function AiNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<Sparkles className="h-5 w-5" />}
      color="bg-violet-500"
      gradient="from-violet-400 to-violet-600"
    />
  );
}
