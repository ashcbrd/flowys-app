"use client";

import { type NodeProps } from "@xyflow/react";
import { FileOutput } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function OutputNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<FileOutput className="h-5 w-5" />}
      color="bg-rose-500"
      gradient="from-rose-400 to-rose-600"
      hasOutput={false}
    />
  );
}
