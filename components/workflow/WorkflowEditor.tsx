"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { NodeDock } from "@/components/panels/NodeDock";
import { ConfigDrawer } from "@/components/panels/ConfigDrawer";
import { ExecutionDrawer } from "@/components/panels/ExecutionDrawer";
import { Header } from "@/components/panels/Header";
import { FluxWidget } from "@/components/flux/FluxWidget";
import { WelcomeState } from "@/components/workflow/WelcomeState";
import { useWorkflowStore } from "@/store/workflow";
import { api } from "@/lib/api";

interface WorkflowEditorProps {
  workflowId?: string;
  versionId?: string;
}

export function WorkflowEditor({ workflowId, versionId }: WorkflowEditorProps) {
  const router = useRouter();
  const hasInitialized = useRef(false);
  const hasLoadedWorkflow = useRef<string | null>(null);
  const {
    loadWorkflow,
    workflow,
    nodes,
    workflowStatus,
    setNodes,
    setEdges,
    hydrateFromStorage,
    isHydrated,
  } = useWorkflowStore();

  // Check if there are unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return nodes.length > 0 && (workflowStatus === "draft" || workflowStatus === "modified");
  }, [nodes.length, workflowStatus]);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Hydrate from storage on mount
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      hydrateFromStorage();
    }
  }, [hydrateFromStorage]);

  // Load workflow from URL - only run when URL params change
  useEffect(() => {
    // Wait for hydration before doing any routing
    if (!isHydrated) return;

    const loadFromUrl = async () => {
      if (workflowId) {
        // Skip if we already loaded this workflow
        if (hasLoadedWorkflow.current === workflowId) return;
        hasLoadedWorkflow.current = workflowId;

        try {
          if (versionId) {
            // Load a specific version
            const version = await api.workflows.versions.get(workflowId, versionId);
            if (version.nodes && version.edges) {
              setNodes(version.nodes as Parameters<typeof setNodes>[0]);
              setEdges(version.edges);
            }
            // Also load the workflow metadata
            await loadWorkflow(workflowId);
          } else {
            // Load the current workflow
            await loadWorkflow(workflowId);
          }
        } catch (error) {
          console.error("Failed to load workflow:", error);
          hasLoadedWorkflow.current = null;
          // Redirect to new workflow if not found
          router.replace("/workflow");
        }
      } else {
        // No workflowId in URL - this is either /workflow or after newWorkflow()
        hasLoadedWorkflow.current = null;
      }
    };

    loadFromUrl();
  }, [workflowId, versionId, loadWorkflow, router, setNodes, setEdges, isHydrated]);

  // Redirect to stored workflow on initial load (only if no URL param)
  useEffect(() => {
    if (!isHydrated) return;
    if (workflowId) return; // Already have a workflow in URL
    if (hasLoadedWorkflow.current) return; // Already loaded something

    // Get fresh state to check currentWorkflowId
    const storedId = useWorkflowStore.getState().currentWorkflowId;
    if (storedId) {
      router.replace(`/workflow/${storedId}`);
    }
  }, [isHydrated, workflowId, router]);

  // Update URL when workflow is saved
  useEffect(() => {
    if (workflow?.id && !workflowId) {
      router.replace(`/workflow/${workflow.id}`);
    }
  }, [workflow?.id, workflowId, router]);

  const showWelcome = nodes.length === 0;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 relative overflow-hidden">
        <WorkflowCanvas />
        {showWelcome && <WelcomeState />}
        <NodeDock />
        <ConfigDrawer />
        <ExecutionDrawer />
      </div>
      <FluxWidget />
    </div>
  );
}
