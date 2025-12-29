"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, type Schedule, type ScheduleFrequency, type Workflow } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SchedulesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId?: string;
  workflowName?: string;
}

const frequencyOptions: { value: ScheduleFrequency; label: string; description: string }[] = [
  { value: "every_minute", label: "Every Minute", description: "Runs every minute" },
  { value: "every_5_minutes", label: "Every 5 Minutes", description: "Runs every 5 minutes" },
  { value: "every_15_minutes", label: "Every 15 Minutes", description: "Runs every 15 minutes" },
  { value: "every_30_minutes", label: "Every 30 Minutes", description: "Runs every 30 minutes" },
  { value: "hourly", label: "Hourly", description: "Runs once every hour" },
  { value: "daily", label: "Daily", description: "Runs once every day" },
  { value: "weekly", label: "Weekly", description: "Runs once every week" },
  { value: "monthly", label: "Monthly", description: "Runs once every month" },
  { value: "custom", label: "Custom (Cron)", description: "Use a custom cron expression" },
];

const daysOfWeek = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function SchedulesPanel({
  open,
  onOpenChange,
  workflowId,
  workflowName,
}: SchedulesPanelProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    workflowId: workflowId || "",
    frequency: "daily" as ScheduleFrequency,
    cronExpression: "",
    hour: 9,
    minute: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
    input: "{}",
    enabled: true,
  });

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchSchedules();
      fetchWorkflows();
    }
  }, [open, workflowId]);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const data = await api.schedules.list(workflowId ? { workflowId } : undefined);
      setSchedules(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load schedules",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const data = await api.workflows.list();
      setWorkflows(data);
    } catch (error) {
      console.error("Failed to load workflows:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      workflowId: workflowId || "",
      frequency: "daily",
      cronExpression: "",
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      dayOfMonth: 1,
      input: "{}",
      enabled: true,
    });
    setEditingSchedule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const openEditDialog = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      description: schedule.description || "",
      workflowId: schedule.workflowId,
      frequency: schedule.frequency,
      cronExpression: schedule.cronExpression,
      hour: 9,
      minute: 0,
      dayOfWeek: 1,
      dayOfMonth: 1,
      input: JSON.stringify(schedule.input || {}, null, 2),
      enabled: schedule.enabled,
    });
    setCreateDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    if (!formData.workflowId) {
      toast({ title: "Error", description: "Please select a workflow", variant: "destructive" });
      return;
    }

    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(formData.input);
    } catch {
      toast({ title: "Error", description: "Invalid JSON in input field", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: formData.name,
        description: formData.description || undefined,
        workflowId: formData.workflowId,
        frequency: formData.frequency,
        cronExpression: formData.frequency === "custom" ? formData.cronExpression : undefined,
        hour: formData.hour,
        minute: formData.minute,
        dayOfWeek: formData.dayOfWeek,
        dayOfMonth: formData.dayOfMonth,
        input,
        enabled: formData.enabled,
      };

      if (editingSchedule) {
        await api.schedules.update(editingSchedule.id, data);
        toast({ title: "Success", description: "Schedule updated successfully" });
      } else {
        await api.schedules.create(data);
        toast({ title: "Success", description: "Schedule created successfully" });
      }

      setCreateDialogOpen(false);
      resetForm();
      fetchSchedules();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save schedule",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!scheduleToDelete) return;

    setDeleting(true);
    try {
      await api.schedules.delete(scheduleToDelete.id);
      toast({ title: "Success", description: "Schedule deleted successfully" });
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
      fetchSchedules();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete schedule",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleEnabled = async (schedule: Schedule) => {
    try {
      await api.schedules.update(schedule.id, { enabled: !schedule.enabled });
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? { ...s, enabled: !s.enabled } : s))
      );
      toast({
        title: schedule.enabled ? "Schedule Paused" : "Schedule Enabled",
        description: `"${schedule.name}" has been ${schedule.enabled ? "paused" : "enabled"}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update schedule",
        variant: "destructive",
      });
    }
  };

  const handleTrigger = async (schedule: Schedule) => {
    setTriggering(schedule.id);
    try {
      const result = await api.schedules.trigger(schedule.id);
      if (result.success) {
        toast({
          title: "Success",
          description: "Schedule triggered successfully",
        });
        fetchSchedules();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to trigger schedule",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to trigger schedule",
        variant: "destructive",
      });
    } finally {
      setTriggering(null);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) {
      // Future time
      const absDiffMins = Math.abs(diffMins);
      const absDiffHours = Math.abs(diffHours);
      if (absDiffMins < 60) return `in ${absDiffMins}m`;
      if (absDiffHours < 24) return `in ${absDiffHours}h`;
      return `in ${Math.abs(diffDays)}d`;
    }

    if (diffSecs < 60) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getWorkflowName = (wfId: string) => {
    const workflow = workflows.find((w) => w.id === wfId);
    return workflow?.name || "Unknown Workflow";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {workflowId ? `Schedules for "${workflowName}"` : "Scheduled Runs"}
            </DialogTitle>
            <DialogDescription>
              Automate your workflows with scheduled runs. Set up daily reports, weekly cleanups, or hourly checks.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between py-2">
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Schedule
            </Button>
            <Button variant="outline" size="sm" onClick={fetchSchedules} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : schedules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No schedules yet</p>
                <p className="text-sm">Create a schedule to automate your workflows</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className={cn(
                      "border rounded-lg p-4",
                      !schedule.enabled && "opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{schedule.name}</h3>
                          {schedule.lastRunStatus === "success" && (
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                          {schedule.lastRunStatus === "failed" && (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          {!schedule.enabled && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">Paused</span>
                          )}
                        </div>
                        {!workflowId && (
                          <p className="text-sm text-muted-foreground truncate">
                            {getWorkflowName(schedule.workflowId)}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {frequencyOptions.find((f) => f.value === schedule.frequency)?.label}
                          </span>
                          {schedule.nextRunAt && schedule.enabled && (
                            <span title={new Date(schedule.nextRunAt).toLocaleString()}>
                              Next: {formatRelativeTime(schedule.nextRunAt)}
                            </span>
                          )}
                          {schedule.lastRunAt && (
                            <span title={new Date(schedule.lastRunAt).toLocaleString()}>
                              Last: {formatRelativeTime(schedule.lastRunAt)}
                            </span>
                          )}
                          <span>
                            {schedule.successfulRuns}/{schedule.totalRuns} runs
                          </span>
                        </div>
                        {schedule.lastRunError && (
                          <p className="text-xs text-red-500 mt-1 truncate" title={schedule.lastRunError}>
                            Error: {schedule.lastRunError}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() => handleToggleEnabled(schedule)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTrigger(schedule)}
                          disabled={triggering === schedule.id}
                          title="Run Now"
                        >
                          {triggering === schedule.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(schedule)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setScheduleToDelete(schedule);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Edit Schedule" : "Create Schedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Daily Report"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Runs the report workflow every day"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {!workflowId && (
              <div className="space-y-2">
                <Label>Workflow</Label>
                <Select
                  value={formData.workflowId}
                  onValueChange={(value) => setFormData({ ...formData, workflowId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) =>
                  setFormData({ ...formData, frequency: value as ScheduleFrequency })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {frequencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.frequency === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="cron">Cron Expression</Label>
                <Input
                  id="cron"
                  placeholder="0 9 * * *"
                  value={formData.cronExpression}
                  onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>
            )}

            {["hourly", "daily", "weekly", "monthly"].includes(formData.frequency) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hour</Label>
                  <Select
                    value={String(formData.hour)}
                    onValueChange={(value) => setFormData({ ...formData, hour: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i.toString().padStart(2, "0")}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Minute</Label>
                  <Select
                    value={String(formData.minute)}
                    onValueChange={(value) => setFormData({ ...formData, minute: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          :{m.toString().padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {formData.frequency === "weekly" && (
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <Select
                  value={String(formData.dayOfWeek)}
                  onValueChange={(value) => setFormData({ ...formData, dayOfWeek: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {daysOfWeek.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.frequency === "monthly" && (
              <div className="space-y-2">
                <Label>Day of Month</Label>
                <Select
                  value={String(formData.dayOfMonth)}
                  onValueChange={(value) => setFormData({ ...formData, dayOfMonth: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="input">Input (JSON)</Label>
              <textarea
                id="input"
                className="w-full h-20 p-2 border rounded-md font-mono text-sm bg-background"
                placeholder='{"key": "value"}'
                value={formData.input}
                onChange={(e) => setFormData({ ...formData, input: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enabled</Label>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : editingSchedule ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Schedule
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{scheduleToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
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
    </>
  );
}
