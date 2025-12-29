"use client";

import { type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function ApiNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<Globe className="h-5 w-5" />}
      color="bg-sky-500"
      gradient="from-sky-400 to-sky-600"
    />
  );
}
