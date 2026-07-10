"use client";

import { type NodeProps } from "@xyflow/react";
import { Mail } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function EmailNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<Mail className="h-5 w-5" />}
      color="bg-orange-500"
      gradient="from-orange-400 to-orange-600"
    />
  );
}
