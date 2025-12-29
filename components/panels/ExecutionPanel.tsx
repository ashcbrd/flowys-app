"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Lightbulb,
  AlertCircle,
  Maximize2,
  X,
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
import { NodeConfigPanel } from "./NodeConfigPanel";

interface OutputModalData {
  nodeName: string;
  output: unknown;
}

export function ExecutionPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [outputModal, setOutputModal] = useState<OutputModalData | null>(null);
  const { selectedNode, executionLogs, lastExecution, isExecuting } = useWorkflowStore();

  return (
    <div
      className={cn(
        "border-l bg-card transition-all duration-300 flex flex-col",
        isOpen ? "w-96" : "w-12"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-3 top-1/2 z-10 h-6 w-6 rounded-full border bg-background"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </Button>

      {isOpen && (
        <>
          {selectedNode ? (
            <NodeConfigPanel />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Execution</h2>
              </div>

              {isExecuting && (
                <div className="p-4 flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Executing workflow...</span>
                </div>
              )}

              {executionLogs.length > 0 && (
                <div className="p-4">
                  <h3 className="text-sm font-medium mb-3">Execution Logs</h3>
                  <div className="space-y-2">
                    {executionLogs.map((log, i) => (
                      <div
                        key={i}
                        className="p-3 border rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {log.status === "completed" && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          {log.status === "failed" && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          {log.status === "running" && (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          )}
                          {log.status === "pending" && (
                            <Clock className="h-4 w-4 text-gray-400" />
                          )}
                          <span className="font-medium">{log.nodeName}</span>
                          {log.duration && (
                            <span className="text-muted-foreground text-xs ml-auto">
                              {log.duration}ms
                            </span>
                          )}
                        </div>
                        {log.error && (
                          <div className="text-red-500 text-xs mt-1">
                            {log.error}
                          </div>
                        )}
                        {log.output && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground">
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

              {lastExecution && (
                <div className="p-4 border-t">
                  <h3 className="text-sm font-medium mb-3">Result</h3>
                  <div
                    className={cn(
                      "p-3 rounded-lg text-sm",
                      lastExecution.status === "completed"
                        ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 border"
                        : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 border"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {lastExecution.status === "completed" ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium capitalize">
                        {lastExecution.status}
                      </span>
                    </div>
                    {lastExecution.error && (
                      <div className="text-red-600 dark:text-red-400 text-xs">
                        {lastExecution.error}
                      </div>
                    )}
                    {lastExecution.output && (
                      <div className="mt-2 relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1 h-6 w-6 p-0"
                          onClick={() => setOutputModal({ nodeName: "Final Result", output: lastExecution.output })}
                          title="Expand view"
                        >
                          <Maximize2 className="h-3 w-3" />
                        </Button>
                        <pre className="p-2 bg-white dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-48">
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
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            {lastExecution.errorAnalysis.summary}
                          </p>
                        </div>
                      </div>

                      {/* Possible Causes */}
                      {lastExecution.errorAnalysis.possibleCauses.length > 0 && (
                        <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="h-4 w-4 text-orange-600" />
                            <span className="text-xs font-medium text-orange-800 dark:text-orange-200">
                              Possible Causes
                            </span>
                          </div>
                          <ul className="text-xs text-orange-700 dark:text-orange-300 space-y-1 ml-6">
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
                            <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                              How to Fix
                            </span>
                          </div>
                          <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-6">
                            {lastExecution.errorAnalysis.suggestedFixes.map((fix, i) => (
                              <li key={i} className="list-decimal">{fix}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Affected Nodes */}
                      {lastExecution.errorAnalysis.affectedNodes.length > 0 && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                          <p className="text-xs text-gray-600 dark:text-gray-400">
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
                <div className="p-4 text-sm text-muted-foreground text-center">
                  <p>No execution data yet.</p>
                  <p className="mt-1">Run the workflow to see results.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

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
    </div>
  );
}
