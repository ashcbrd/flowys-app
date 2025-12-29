"use client";

import { type NodeProps } from "@xyflow/react";
import { Webhook } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function WebhookNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<Webhook className="h-5 w-5" />}
      color="bg-cyan-500"
      gradient="from-cyan-400 to-cyan-600"
    />
  );
}
