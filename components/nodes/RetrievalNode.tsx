"use client";

import { type NodeProps } from "@xyflow/react";
import { BookOpenText } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function RetrievalNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      icon={<BookOpenText className="h-5 w-5" />}
      color="bg-teal-500"
      gradient="from-teal-400 to-teal-600"
    />
  );
}
