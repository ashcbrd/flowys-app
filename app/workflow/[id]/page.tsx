"use client";

import { use } from "react";
import { WorkflowEditor } from "@/components/workflow/WorkflowEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowByIdPage({ params }: PageProps) {
  const { id } = use(params);
  return <WorkflowEditor workflowId={id} />;
}
