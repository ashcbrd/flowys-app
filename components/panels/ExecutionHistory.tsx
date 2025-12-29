"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Execution } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ExecutionHistoryProps {
  workflowId: string;
  defaultExpanded?: boolean;
  maxItems?: number;
  className?: string;
  compact?: boolean;
}

export function ExecutionHistory({
  workflowId,
  defaultExpanded = false,
  maxItems = 10,
  className,
  compact = false,
}: ExecutionHistoryProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchExecutions = async () => {
    if (!workflowId) return;
    setLoading(true);
    try {
      const data = await api.executions.byWorkflow(workflowId);
      setExecutions(data);
      setLoaded(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load execution history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ((expanded || compact) && !loaded) {
      fetchExecutions();
    }
  }, [expanded, workflowId, compact]);

  // Refresh when workflowId changes
  useEffect(() => {
    if (loaded) {
      setLoaded(false);
      if (expanded) {
        fetchExecutions();
      }
    }
  }, [workflowId]);

  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt || !completedAt) return "-";
    const duration =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const displayedExecutions = executions.slice(0, maxItems);
  const remainingCount = executions.length - maxItems;

  if (compact) {
    return (
      <div className={cn("border-t bg-muted/30 p-3", className)}>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Execution History
        </h4>

        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history...
          </div>
        ) : executions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No execution history yet
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {displayedExecutions.map((execution) => (
              <div
                key={execution.id}
                className={cn(
                  "p-2 rounded text-sm flex items-center justify-between",
                  execution.status === "completed"
                    ? "bg-green-50 dark:bg-green-950/30"
                    : execution.status === "failed"
                    ? "bg-red-50 dark:bg-red-950/30"
                    : "bg-muted"
                )}
              >
                <div className="flex items-center gap-2">
                  {execution.status === "completed" ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : execution.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <span className="capitalize">{execution.status}</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3">
                  <span>
                    {formatDuration(execution.startedAt, execution.completedAt)}
                  </span>
                  <span>{formatDate(execution.createdAt)}</span>
                </div>
              </div>
            ))}
            {remainingCount > 0 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{remainingCount} more executions
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      <Button
        variant="ghost"
        className="w-full justify-between p-3 h-auto rounded-none hover:bg-muted/50"
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span className="font-medium">Execution History</span>
          {loaded && executions.length > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded">
              {executions.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>

      {expanded && (
        <div className="border-t bg-muted/30 p-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history...
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No execution history yet</p>
              <p className="text-xs">Run the workflow to see executions here</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {displayedExecutions.map((execution) => (
                <div
                  key={execution.id}
                  className={cn(
                    "p-3 rounded-lg text-sm flex items-center justify-between",
                    execution.status === "completed"
                      ? "bg-green-50 dark:bg-green-950/30"
                      : execution.status === "failed"
                      ? "bg-red-50 dark:bg-red-950/30"
                      : "bg-muted"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {execution.status === "completed" ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : execution.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : execution.status === "running" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="capitalize font-medium">
                      {execution.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="font-mono">
                      {formatDuration(
                        execution.startedAt,
                        execution.completedAt
                      )}
                    </span>
                    <span>{formatDate(execution.createdAt)}</span>
                  </div>
                </div>
              ))}
              {remainingCount > 0 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  +{remainingCount} more executions
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
