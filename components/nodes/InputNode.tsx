"use client";

import { type NodeProps } from "@xyflow/react";
import { FileInput } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function InputNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<FileInput className="h-5 w-5" />}
      color="bg-emerald-500"
      gradient="from-emerald-400 to-emerald-600"
      hasInput={false}
    />
  );
}
