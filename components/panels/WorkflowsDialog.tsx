"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Trash2,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  AlertTriangle,
  Copy,
  History,
  FileEdit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, type Workflow } from "@/lib/api";
import { useWorkflowStore } from "@/store/workflow";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { VersionsModal } from "./VersionsModal";
import { ExecutionHistory } from "./ExecutionHistory";

interface WorkflowsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WorkflowsDialog({ open: controlledOpen, onOpenChange }: WorkflowsDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

  // Selection state
  const [selectedWorkflows, setSelectedWorkflows] = useState<Set<string>>(new Set());

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [workflowsToDelete, setWorkflowsToDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Duplicate state
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // Version control state
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [selectedWorkflowForVersions, setSelectedWorkflowForVersions] = useState<Workflow | null>(null);

  const router = useRouter();
  const { loadWorkflow, hasDraft, loadDraft, draftWorkflow, forgetWorkflows } =
    useWorkflowStore();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchWorkflows();
      setSelectedWorkflows(new Set());
    }
  }, [open]);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const data = await api.workflows.list();
      setWorkflows(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load workflows",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadWorkflow = async (workflow: Workflow) => {
    try {
      await loadWorkflow(workflow.id);
      setOpen(false);
      router.push(`/workflow/${workflow.id}`);
      toast({
        title: "Workflow Loaded",
        description: `"${workflow.name}" has been loaded`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load workflow",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async (workflow: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();

    setDuplicating(workflow.id);
    try {
      const duplicated = await api.workflows.duplicate(workflow.id);
      setWorkflows((prev) => [duplicated, ...prev]);
      toast({
        title: "Workflow Duplicated",
        description: `"${duplicated.name}" has been created`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to duplicate workflow",
        variant: "destructive",
      });
    } finally {
      setDuplicating(null);
    }
  };

  const openVersionsModal = (workflow: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWorkflowForVersions(workflow);
    setVersionsModalOpen(true);
  };

  const handleVersionRestored = async () => {
    // Reload the workflow in the editor if it's currently loaded
    if (selectedWorkflowForVersions) {
      const currentWorkflowId = useWorkflowStore.getState().currentWorkflowId;
      if (currentWorkflowId === selectedWorkflowForVersions.id) {
        await loadWorkflow(selectedWorkflowForVersions.id);
      }
    }
    // Refresh workflows list
    await fetchWorkflows();
  };

  // Selection handlers
  const toggleSelectWorkflow = (workflowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWorkflows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(workflowId)) {
        newSet.delete(workflowId);
      } else {
        newSet.add(workflowId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedWorkflows.size === workflows.length) {
      setSelectedWorkflows(new Set());
    } else {
      setSelectedWorkflows(new Set(workflows.map((w) => w.id)));
    }
  };

  const isAllSelected = workflows.length > 0 && selectedWorkflows.size === workflows.length;
  const isSomeSelected = selectedWorkflows.size > 0 && selectedWorkflows.size < workflows.length;

  // Delete handlers
  const openDeleteModal = (workflowIds: string[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWorkflowsToDelete(workflowIds);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await Promise.all(workflowsToDelete.map((id) => api.workflows.delete(id)));
      setWorkflows((prev) => prev.filter((w) => !workflowsToDelete.includes(w.id)));

      // If one of these was open, take it off the canvas too.
      const openId = useWorkflowStore.getState().currentWorkflowId;
      const deletedTheOpenOne = !!openId && workflowsToDelete.includes(openId);
      forgetWorkflows(workflowsToDelete);

      // Clearing the canvas is only half of it. The address bar still read
      // /workflow/<deleted id>, so a reload asked the server for a workflow
      // that no longer exists and the page fought to restore it. Leave the
      // dead address behind.
      if (deletedTheOpenOne) {
        router.replace("/workflow");
      }
      setSelectedWorkflows((prev) => {
        const newSet = new Set(prev);
        workflowsToDelete.forEach((id) => newSet.delete(id));
        return newSet;
      });
      toast({
        title: "Deleted",
        description: `${workflowsToDelete.length} workflow${workflowsToDelete.length > 1 ? "s" : ""} deleted successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete some workflows",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
      setWorkflowsToDelete([]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedWorkflows.size === 0) return;
    openDeleteModal(Array.from(selectedWorkflows));
  };

  const toggleExpand = (workflowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedWorkflow(expandedWorkflow === workflowId ? null : workflowId);
  };

  const getWorkflowNamesToDelete = () => {
    return workflowsToDelete
      .map((id) => workflows.find((w) => w.id === id)?.name)
      .filter(Boolean);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const isControlled = controlledOpen !== undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {!isControlled && (
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderOpen className="h-4 w-4 mr-1" />
              Workflows
            </Button>
          </DialogTrigger>
        )}
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Workflows</DialogTitle>
          </DialogHeader>

          {/* Draft Section */}
          {hasDraft() && draftWorkflow && (
            <div className="border-b pb-4 mb-2">
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <FileEdit className="h-4 w-4" />
                Draft
              </h3>
              <div
                className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer flex items-center justify-between"
                onClick={() => {
                  loadDraft();
                  setOpen(false);
                  router.push("/workflow");
                  toast({
                    title: "Draft Loaded",
                    description: "Your unsaved draft has been restored",
                  });
                }}
              >
                <div>
                  <h4 className="font-medium">Unsaved Draft</h4>
                  <p className="text-xs text-muted-foreground">
                    {draftWorkflow.nodes.length} nodes · Last modified{" "}
                    {formatDate(draftWorkflow.lastModified)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" title="Load Draft">
                  <Play className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Saved Workflows Section */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Saved Workflows
            </h3>
            {!loading && (
              <div className="text-xs px-2 py-1 rounded-full font-medium bg-muted text-muted-foreground">
                {workflows.length} total
              </div>
            )}
          </div>

          {/* Toolbar with Select All and Bulk Delete */}
          {workflows.length > 0 && (
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedWorkflows.size > 0
                      ? `${selectedWorkflows.size} selected`
                      : "Select all"}
                  </span>
                </label>
              </div>
              {selectedWorkflows.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selectedWorkflows.size})
                </Button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto mt-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No saved workflows yet</p>
                <p className="text-sm">Create and save a workflow to see it here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {workflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className={cn(
                      "border rounded-lg overflow-hidden",
                      selectedWorkflows.has(workflow.id) && "ring-2 ring-primary"
                    )}
                  >
                    {/* Workflow Header */}
                    <div
                      className="p-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleLoadWorkflow(workflow)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedWorkflows.has(workflow.id)}
                          onChange={() => {}}
                          onClick={(e) => toggleSelectWorkflow(workflow.id, e)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <button
                          onClick={(e) => toggleExpand(workflow.id, e)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {expandedWorkflow === workflow.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        <div>
                          <h3 className="font-medium">{workflow.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {workflow.nodes.length} nodes ·{" "}
                            <span title={new Date(workflow.updatedAt).toLocaleString()}>
                              Modified {formatDate(workflow.updatedAt)}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => openVersionsModal(workflow, e)}
                          title="Version History"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDuplicate(workflow, e)}
                          disabled={duplicating === workflow.id}
                          title="Duplicate Workflow"
                        >
                          {duplicating === workflow.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoadWorkflow(workflow);
                          }}
                          title="Load Workflow"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => openDeleteModal([workflow.id], e)}
                          title="Delete Workflow"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Execution History */}
                    {expandedWorkflow === workflow.id && (
                      <ExecutionHistory
                        workflowId={workflow.id}
                        compact={true}
                        maxItems={10}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Workflow{workflowsToDelete.length > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              {workflowsToDelete.length === 1 ? (
                <span className="font-medium">&quot;{getWorkflowNamesToDelete()[0]}&quot;</span>
              ) : (
                <span className="font-medium">{workflowsToDelete.length} workflows</span>
              )}
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {workflowsToDelete.length > 1 && (
            <div className="max-h-32 overflow-y-auto border rounded p-2 bg-muted/50">
              <ul className="text-sm space-y-1">
                {getWorkflowNamesToDelete().map((name, i) => (
                  <li key={i} className="text-muted-foreground">• {name}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Modal */}
      {selectedWorkflowForVersions && (
        <VersionsModal
          open={versionsModalOpen}
          onOpenChange={setVersionsModalOpen}
          workflowId={selectedWorkflowForVersions.id}
          workflowName={selectedWorkflowForVersions.name}
          onVersionRestored={handleVersionRestored}
        />
      )}
    </>
  );
}
