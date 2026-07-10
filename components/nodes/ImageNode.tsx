"use client";

import { type NodeProps } from "@xyflow/react";
import { Image as ImageIcon } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function ImageNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<ImageIcon className="h-5 w-5" />}
      color="bg-fuchsia-500"
      gradient="from-fuchsia-400 to-fuchsia-600"
    />
  );
}
