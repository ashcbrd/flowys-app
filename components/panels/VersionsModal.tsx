"use client";

import { useState, useEffect } from "react";
import {
  History,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, type WorkflowVersion } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface VersionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  workflowName: string;
  onVersionRestored?: () => void;
}

export function VersionsModal({
  open,
  onOpenChange,
  workflowId,
  workflowName,
  onVersionRestored,
}: VersionsModalProps) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [versionMessage, setVersionMessage] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null);

  const fetchVersions = async () => {
    if (!workflowId) return;
    setLoadingVersions(true);
    try {
      const data = await api.workflows.versions.list(workflowId);
      setVersions(data.versions);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load versions",
        variant: "destructive",
      });
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (open && workflowId) {
      fetchVersions();
    }
  }, [open, workflowId]);

  const handleCreateVersion = async () => {
    if (!workflowId) return;
    setCreatingVersion(true);
    try {
      const version = await api.workflows.versions.create(
        workflowId,
        versionMessage || undefined
      );
      setVersionMessage("");
      setVersions((prev) => [version, ...prev]);
      toast({
        title: "Version Saved",
        description: `Version ${version.version} has been saved`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save version",
        variant: "destructive",
      });
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleRestoreVersion = async (version: WorkflowVersion) => {
    if (!workflowId) return;
    setRestoringVersion(version.id);
    try {
      const result = await api.workflows.versions.restore(workflowId, version.id);
      await fetchVersions();
      toast({
        title: "Version Restored",
        description: result.message,
      });
      onVersionRestored?.();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore version",
        variant: "destructive",
      });
    } finally {
      setRestoringVersion(null);
    }
  };

  const handleDeleteVersion = async (version: WorkflowVersion) => {
    if (!workflowId) return;
    setDeletingVersion(version.id);
    try {
      await api.workflows.versions.delete(workflowId, version.id);
      setVersions((prev) => prev.filter((v) => v.id !== version.id));
      toast({
        title: "Version Deleted",
        description: `Version ${version.version} has been deleted`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete version",
        variant: "destructive",
      });
    } finally {
      setDeletingVersion(null);
    }
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>{workflowName}</DialogDescription>
        </DialogHeader>

        {/* Save Version Section */}
        <div className="border rounded-lg p-3 bg-muted/30">
          <h4 className="text-sm font-medium mb-2">Save Current Version</h4>
          <div className="flex gap-2">
            <Input
              placeholder="Version message (optional)"
              value={versionMessage}
              onChange={(e) => setVersionMessage(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleCreateVersion}
              disabled={creatingVersion}
              size="sm"
            >
              {creatingVersion ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto mt-2">
          {loadingVersions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No versions saved yet</p>
              <p className="text-sm">Save a version to track changes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="border rounded-lg p-3 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Version {version.version}
                        </span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                          {version.nodeCount} nodes
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {version.message || `Version ${version.version}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeDate(version.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestoreVersion(version)}
                        disabled={
                          restoringVersion === version.id ||
                          deletingVersion === version.id
                        }
                      >
                        {restoringVersion === version.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Restore
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteVersion(version)}
                        disabled={
                          restoringVersion === version.id ||
                          deletingVersion === version.id
                        }
                        title="Delete version"
                      >
                        {deletingVersion === version.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
