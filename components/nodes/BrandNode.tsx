"use client";

import { type NodeProps } from "@xyflow/react";
import { Palette } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function BrandNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<Palette className="h-5 w-5" />}
      color="bg-pink-500"
      gradient="from-pink-400 to-pink-600"
    />
  );
}
