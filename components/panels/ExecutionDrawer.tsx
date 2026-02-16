"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  Maximize2,
  X,
  Play,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow";

interface OutputModalData {
  nodeName: string;
  output: unknown;
}

export function ExecutionDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [outputModal, setOutputModal] = useState<OutputModalData | null>(null);
  const { executionLogs, lastExecution, isExecuting } = useWorkflowStore();

  // Auto-open drawer when execution starts
  useEffect(() => {
    const handleExecutionStarted = () => {
      setIsOpen(true);
    };

    window.addEventListener("execution-started", handleExecutionStarted);
    return () => {
      window.removeEventListener("execution-started", handleExecutionStarted);
    };
  }, []);

  // Also auto-open when isExecuting becomes true
  useEffect(() => {
    if (isExecuting) {
      setIsOpen(true);
    }
  }, [isExecuting]);

  const hasExecutionData = isExecuting || executionLogs.length > 0 || lastExecution;

  // Don't render anything if there's no execution data
  if (!hasExecutionData) {
    return null;
  }

  return (
    <>
      {/* Floating Execution Button - only show when drawer is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "absolute right-4 top-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all",
            "hover:scale-105 active:scale-95",
            isExecuting
              ? "bg-blue-600 text-white animate-pulse"
              : lastExecution?.status === "completed"
              ? "bg-green-600 text-white"
              : lastExecution?.status === "failed"
              ? "bg-red-600 text-white"
              : "bg-primary text-primary-foreground"
          )}
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Executing...</span>
            </>
          ) : lastExecution?.status === "completed" ? (
            <>
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Completed</span>
            </>
          ) : lastExecution?.status === "failed" ? (
            <>
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Failed</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              <span className="text-sm font-medium">Execution</span>
            </>
          )}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Drawer Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[420px] max-w-full bg-background border-l shadow-2xl z-50",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {isExecuting ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            ) : lastExecution?.status === "completed" ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : lastExecution?.status === "failed" ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : (
              <Play className="h-5 w-5 text-muted-foreground" />
            )}
            <h2 className="font-semibold text-lg">Execution</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-[calc(100%-65px)]">
          {isExecuting && (
            <div className="p-4 flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 border-b">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Executing workflow...
              </span>
            </div>
          )}

          {/* Execution Logs */}
          {executionLogs.length > 0 && (
            <div className="p-4">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">
                Node Execution
              </h3>
              <div className="space-y-2">
                {executionLogs.map((log, i) => (
                  <div
                    key={i}
                    className={cn(
                      "p-3 border rounded-lg text-sm",
                      log.status === "completed" && "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20",
                      log.status === "failed" && "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20",
                      log.status === "running" && "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20",
                      log.status === "pending" && "border-gray-200 dark:border-gray-700"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {log.status === "completed" && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                      {log.status === "failed" && (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {log.status === "running" && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      )}
                      {log.status === "pending" && (
                        <Clock className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="font-medium flex-1">{log.nodeName}</span>
                      {log.duration && (
                        <span className="text-muted-foreground text-xs">
                          {log.duration}ms
                        </span>
                      )}
                    </div>
                    {log.error && (
                      <div className="text-red-600 dark:text-red-400 text-xs mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded">
                        {log.error}
                      </div>
                    )}
                    {log.output && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          View output
                        </summary>
                        <div className="mt-2 relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1 h-6 w-6 p-0"
                            onClick={() => setOutputModal({ nodeName: log.nodeName, output: log.output })}
                            title="Expand view"
                          >
                            <Maximize2 className="h-3 w-3" />
                          </Button>
                          <pre className="p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
                            {JSON.stringify(log.output, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Result */}
          {lastExecution && (
            <div className="p-4 border-t">
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">
                Final Result
              </h3>
              <div
                className={cn(
                  "p-4 rounded-lg text-sm",
                  lastExecution.status === "completed"
                    ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 border"
                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 border"
                )}
              >
                <div className="flex items-center gap-2 mb-3">
                  {lastExecution.status === "completed" ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-semibold capitalize">
                    {lastExecution.status}
                  </span>
                </div>
                {lastExecution.error && (
                  <div className="text-red-600 dark:text-red-400 text-sm mb-3 p-2 bg-red-100 dark:bg-red-900/30 rounded">
                    {lastExecution.error}
                  </div>
                )}
                {lastExecution.output && (
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1 h-6 w-6 p-0"
                      onClick={() => setOutputModal({ nodeName: "Final Result", output: lastExecution.output })}
                      title="Expand view"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </Button>
                    <pre className="p-3 bg-white dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-48 border">
                      {JSON.stringify(lastExecution.output, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Error Analysis Section */}
              {lastExecution.errorAnalysis && (
                <div className="mt-4 space-y-3">
                  {/* Summary */}
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        {lastExecution.errorAnalysis.summary}
                      </p>
                    </div>
                  </div>

                  {/* Possible Causes */}
                  {lastExecution.errorAnalysis.possibleCauses.length > 0 && (
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
                          Possible Causes
                        </span>
                      </div>
                      <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1 ml-6">
                        {lastExecution.errorAnalysis.possibleCauses.map((cause, i) => (
                          <li key={i} className="list-disc">{cause}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggested Fixes */}
                  {lastExecution.errorAnalysis.suggestedFixes.length > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          How to Fix
                        </span>
                      </div>
                      <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 ml-6">
                        {lastExecution.errorAnalysis.suggestedFixes.map((fix, i) => (
                          <li key={i} className="list-decimal">{fix}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Affected Nodes */}
                  {lastExecution.errorAnalysis.affectedNodes.length > 0 && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Blocked nodes:</span>{" "}
                        {lastExecution.errorAnalysis.affectedNodes.join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isExecuting && executionLogs.length === 0 && !lastExecution && (
            <div className="p-8 text-center text-muted-foreground">
              <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No execution data yet</p>
              <p className="text-sm mt-1">Run the workflow to see results</p>
            </div>
          )}
        </div>
      </div>

      {/* Output Expand Modal */}
      <Dialog open={outputModal !== null} onOpenChange={(open) => !open && setOutputModal(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Output: {outputModal?.nodeName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <pre className="p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap break-words">
              {outputModal && JSON.stringify(outputModal.output, null, 2)}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutputModal(null)}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
