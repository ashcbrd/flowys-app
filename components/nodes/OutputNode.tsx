"use client";

import { type NodeProps } from "@xyflow/react";
import { FileOutput } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function OutputNode(props: NodeProps) {
  // The output step DOES have a source handle. It reads as terminal, but
  // every template wires its result into a final webhook step ("Send it on"),
  // and the engine runs that edge. With hasOutput={false} React Flow had the
  // edge in the data and no handle to draw it from, so the last step of every
  // template floated on the canvas looking disconnected while running fine.
  return (
    <BaseNode
      {...props}
      icon={<FileOutput className="h-5 w-5" />}
      color="bg-rose-500"
      gradient="from-rose-400 to-rose-600"
    />
  );
}
