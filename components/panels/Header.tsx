"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Play,
  Save,
  Trash2,
  Undo2,
  Redo2,
  FilePlus,
  History,
  BookOpen,
  FolderOpen,
  Clock,
  Calendar,
  Plug,
  Loader2,
  Check,
  Pencil,
  Wand2,
  LogOut,
  User,
  Download,
  Upload,
  Webhook,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useWorkflowStore, type WorkflowStatus } from "@/store/workflow";
import { useToast } from "@/hooks/use-toast";
import { WorkflowsDialog } from "./WorkflowsDialog";
import { VersionsModal } from "./VersionsModal";
import { ExecutionHistory } from "./ExecutionHistory";
import { SchedulesPanel } from "./SchedulesPanel";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  RunForm,
  inputFieldsOf,
  initialRunValues,
  validateRunValues,
  type RunValues,
} from "@/components/inputs/RunForm";

export function Header() {
  const router = useRouter();
  const { data: session } = useSession();
  const {
    workflow,
    currentWorkflowId,
    workflowStatus,
    isExecuting,
    executeWorkflow,
    saveWorkflow,
    loadWorkflow,
    clearCanvas,
    newWorkflow,
    undo,
    redo,
    canUndo,
    canRedo,
    beautifyLayout,
    hasConnectedNodes,
    exportWorkflow,
    importWorkflow,
    nodes,
  } = useWorkflowStore();
  const { toast } = useToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [executionHistoryOpen, setExecutionHistoryOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [runValues, setRunValues] = useState<RunValues>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const workflowName = workflow?.name || "Untitled Workflow";

  // What this workflow asks for before it can run.
  const runFields = inputFieldsOf(nodes);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleStartEditing = () => {
    setEditedName(workflowName);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) {
      setIsEditingName(false);
      return;
    }

    setIsSaving(true);
    try {
      await saveWorkflow(editedName);
      const savedWorkflowId = useWorkflowStore.getState().currentWorkflowId;
      if (savedWorkflowId) {
        router.push(`/workflow/${savedWorkflowId}`);
      }
      toast({
        title: "Saved",
        description: "Workflow saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save workflow",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      setIsEditingName(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
    }
  };

  const runWith = async (input: Record<string, unknown>) => {
    try {
      await executeWorkflow(input);
      toast({
        title: "Success",
        description: "Workflow executed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to execute workflow",
        variant: "destructive",
      });
    }
  };

  // A workflow that asks for nothing shouldn't interrupt with a dialog.
  const startRun = async () => {
    if (runFields.length === 0) {
      await runWith({});
      return;
    }

    setRunValues(initialRunValues(runFields));
    setRunErrors({});
    setRunDialogOpen(true);
  };

  const handleRun = async () => {
    const errors = validateRunValues(runFields, runValues);
    if (Object.keys(errors).length > 0) {
      setRunErrors(errors);
      return;
    }

    setRunDialogOpen(false);
    await runWith(runValues);
  };

  const handleQuickSave = async () => {
    setIsSaving(true);
    try {
      await saveWorkflow(workflowName);
      const savedWorkflowId = useWorkflowStore.getState().currentWorkflowId;
      if (savedWorkflowId) {
        router.push(`/workflow/${savedWorkflowId}`);
      }
      toast({
        title: "Saved",
        description: "Workflow saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save workflow",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    exportWorkflow();
    toast({
      title: "Exported",
      description: "Workflow downloaded as JSON",
    });
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importWorkflow(file);
      router.replace("/workflow");
      toast({
        title: "Imported",
        description: "Workflow loaded successfully",
      });
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Invalid workflow file",
        variant: "destructive",
      });
    }

    // Reset file input
    e.target.value = "";
  };

  const getStatusIndicator = (status: WorkflowStatus) => {
    switch (status) {
      case "draft":
        return (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            Draft
          </span>
        );
      case "saved":
        return (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Check className="w-3 h-3" />
            Saved
          </span>
        );
      case "modified":
        return (
          <span className="flex items-center gap-1.5 text-xs text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unsaved changes
          </span>
        );
    }
  };

  return (
    <>
      <header className="h-14 border-b bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 z-50">
        {/* Left: Logo + Workflow Name */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">F</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={nameInputRef}
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleKeyDown}
                  className="h-8 w-48 text-sm"
                  disabled={isSaving}
                />
                {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            ) : (
              <button
                onClick={handleStartEditing}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium",
                  "hover:bg-muted transition-colors group"
                )}
              >
                <span>{workflowName}</span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            {getStatusIndicator(workflowStatus)}
          </div>
        </div>

        {/* Center: Execution status (when running) */}
        <div className="absolute left-1/2 -translate-x-1/2">
          {isExecuting && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Running workflow...</span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Auto Layout - only show when nodes are connected */}
          {hasConnectedNodes() && (
            <Button
              variant="outline"
              size="sm"
              onClick={beautifyLayout}
              className="gap-1.5 h-8"
              title="Auto-arrange nodes"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Auto Layout
            </Button>
          )}

          {/* Undo/Redo */}
          <div className="flex items-center border rounded-lg p-0.5 bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={undo}
              disabled={!canUndo()}
              title="Undo"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={redo}
              disabled={!canRedo()}
              title="Redo"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Clear Canvas */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={clearCanvas}
            title="Clear Canvas"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {/* Save Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleQuickSave}
            disabled={isSaving}
            title="Save Workflow"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </Button>

          {/* Run Button - Primary action */}
          <Button
            onClick={startRun}
            disabled={isExecuting}
            className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-md"
          >
            {isExecuting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isExecuting ? "Running..." : "Run"}
          </Button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user.image || undefined} alt={session.user.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {session.user.name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {session.user.name && (
                      <p className="font-medium">{session.user.name}</p>
                    )}
                    {session.user.email && (
                      <p className="w-[200px] truncate text-sm text-muted-foreground">
                        {session.user.email}
                      </p>
                    )}
                  </div>
                </div>

                <DropdownMenuSeparator />

                {/* Workflow section */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Workflow
                </div>
                <DropdownMenuItem onClick={() => { newWorkflow(); router.replace("/workflow"); }}>
                  <FilePlus className="h-4 w-4" />
                  New Workflow
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWorkflowsOpen(true)}>
                  <FolderOpen className="h-4 w-4" />
                  Open Workflow
                </DropdownMenuItem>
                {currentWorkflowId && (
                  <DropdownMenuItem onClick={() => setVersionsOpen(true)}>
                    <History className="h-4 w-4" />
                    Version History
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="h-4 w-4" />
                  Export Workflow
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImportClick}>
                  <Upload className="h-4 w-4" />
                  Import Workflow
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* View section */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  View
                </div>
                {currentWorkflowId && (
                  <DropdownMenuItem onClick={() => setExecutionHistoryOpen(!executionHistoryOpen)}>
                    <Clock className="h-4 w-4" />
                    Execution History
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setSchedulesOpen(true)}>
                  <Calendar className="h-4 w-4" />
                  Scheduled Runs
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Settings section */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Settings
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/integrations">
                    <Plug className="h-4 w-4" />
                    App Integrations
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/webhooks">
                    <Webhook className="h-4 w-4" />
                    Webhooks
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/api-keys">
                    <Key className="h-4 w-4" />
                    API Keys
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                {/* Help section */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Help
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/docs" target="_blank">
                    <BookOpen className="h-4 w-4" />
                    Documentation
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/tutorial">
                    <Play className="h-4 w-4" />
                    Tutorial
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 cursor-pointer"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Execution History - Collapsible section below header */}
      {currentWorkflowId && executionHistoryOpen && (
        <div className="border-b bg-card px-4 py-3">
          <ExecutionHistory
            workflowId={currentWorkflowId}
            defaultExpanded={true}
            maxItems={10}
          />
        </div>
      )}

      {/* Run Dialog */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Before we start</DialogTitle>
          </DialogHeader>
          <div className="py-2 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground mb-4">
              This workflow needs a few details to run.
            </p>
            <RunForm
              fields={runFields}
              values={runValues}
              onChange={(next) => {
                setRunValues(next);
                // Clear a field's error as soon as the user edits anything.
                if (Object.keys(runErrors).length > 0) setRunErrors({});
              }}
              errors={runErrors}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRun} disabled={isExecuting} className="gap-2">
              <Play className="h-4 w-4" />
              {isExecuting ? "Running..." : "Run workflow"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workflows Dialog */}
      <WorkflowsDialog open={workflowsOpen} onOpenChange={setWorkflowsOpen} />

      {/* Version History Modal */}
      {currentWorkflowId && (
        <VersionsModal
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          workflowId={currentWorkflowId}
          workflowName={workflow?.name || ""}
          onVersionRestored={() => loadWorkflow(currentWorkflowId)}
        />
      )}

      {/* Schedules Panel */}
      <SchedulesPanel
        open={schedulesOpen}
        onOpenChange={setSchedulesOpen}
        workflowId={currentWorkflowId || undefined}
        workflowName={workflow?.name}
      />

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        className="hidden"
      />
    </>
  );
}
