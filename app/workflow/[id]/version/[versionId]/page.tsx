"use client";

import { use } from "react";
import { WorkflowEditor } from "@/components/workflow/WorkflowEditor";

interface PageProps {
  params: Promise<{ id: string; versionId: string }>;
}

export default function WorkflowVersionPage({ params }: PageProps) {
  const { id, versionId } = use(params);
  return <WorkflowEditor workflowId={id} versionId={versionId} />;
}
