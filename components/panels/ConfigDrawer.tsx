"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, FlaskConical, Loader2, Play, Settings, X, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { NodeConfigPanel } from "@/components/panels/NodeConfigPanel";
import { ValueEditor } from "@/components/inputs/ValueEditor";
import { useWorkflowStore } from "@/store/workflow";
import { cn } from "@/lib/utils";
import { ResultView } from "@/components/shared/ResultView";
import { extractTokens } from "@/lib/utils/template";
import { RunForm } from "@/components/inputs/RunForm";
import { humanizeFieldName } from "@/lib/vocabulary";

interface TestResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

/**
 * The values a step refers to, as an object of empty strings.
 *
 * Derived from the {{tokens}} in the step's own settings, so the test panel opens
 * with the right field names already listed.
 */
function sampleInputFor(
  node: { data?: { config?: Record<string, unknown> } } | null
): Record<string, unknown> {
  const config = node?.data?.config;
  if (!config) return {};

  const texts = Object.values(config).filter(
    (v): v is string => typeof v === "string"
  );

  // Templates can also live inside nested config (a webhook payload, say).
  const nested = JSON.stringify(
    Object.values(config).filter((v) => v && typeof v === "object")
  );

  const seeded: Record<string, unknown> = {};
  for (const text of [...texts, nested]) {
    for (const token of extractTokens(text)) {
      seeded[token.split(".")[0]] = "";
    }
  }

  return seeded;
}

export function ConfigDrawer() {
  const { selectedNode, lastExecution, executionLogs, nodes } = useWorkflowStore();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("setup");
  // Open drawer when a node is selected
  useEffect(() => {
    if (selectedNode) {
      setIsOpen(true);
    }
  }, [selectedNode]);

  // Close drawer handler
  const handleClose = () => {
    setIsOpen(false);
  };

  if (!selectedNode) {
    return null;
  }

  // Shown under the step's name in the drawer header.
  const nodeTypeLabels: Record<string, string> = {
    input: "Input",
    api: "API Request",
    ai: "AI Assistant",
    logic: "Logic",
    output: "Output",
    integration: "Integration",
    webhook: "Webhook",
  };

  const nodeTypeColors: Record<string, string> = {
    input: "bg-emerald-500",
    api: "bg-sky-500",
    ai: "bg-violet-500",
    logic: "bg-amber-500",
    output: "bg-rose-500",
    integration: "bg-indigo-500",
    webhook: "bg-cyan-500",
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="absolute inset-0 bg-black/20 z-40"
          onClick={handleClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "absolute top-0 right-0 h-full w-[400px] max-w-full bg-background border-l shadow-2xl z-50",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center text-white",
                nodeTypeColors[selectedNode.type] || "bg-gray-500"
              )}
            >
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">
                {selectedNode.data.label ||
                  nodeTypeLabels[selectedNode.type] ||
                  "Set up this step"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {nodeTypeLabels[selectedNode.type]}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col h-[calc(100%-57px)]"
        >
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 h-10">
            <TabsTrigger
              value="setup"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Setup
            </TabsTrigger>
            <TabsTrigger
              value="test"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
              Test
            </TabsTrigger>
            <TabsTrigger
              value="output"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Output
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="flex-1 overflow-auto m-0 p-4">
            <NodeConfigPanel />
          </TabsContent>

          <TabsContent value="test" className="flex-1 overflow-auto m-0 p-4">
            <StepTester key={selectedNode.id} node={selectedNode} />
          </TabsContent>

          <TabsContent value="output" className="flex-1 overflow-auto m-0 p-4">
            <div className="space-y-4">
              {(() => {
                // Check real-time execution logs first, then fall back to lastExecution
                const nodeLog = executionLogs.find(
                  (log) => log.nodeId === selectedNode.id
                ) || lastExecution?.logs?.find(
                  (log) => log.nodeId === selectedNode.id
                );

                if (nodeLog?.status === "running") {
                  return (
                    <div className="text-center py-8">
                      <Loader2 className="h-10 w-10 mx-auto text-blue-500 mb-3 animate-spin" />
                      <h4 className="font-medium text-sm mb-1">Executing...</h4>
                      <p className="text-xs text-muted-foreground">
                        This node is currently running
                      </p>
                    </div>
                  );
                }

                if (nodeLog?.status === "failed") {
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Last run</span>
                        <span className="font-mono text-xs text-red-500">Failed</span>
                      </div>
                      {nodeLog.error && (
                        <div className="p-3 bg-red-500/10 rounded-lg">
                          <p className="text-xs font-medium text-red-600 mb-1">Error</p>
                          <p className="text-xs text-red-600/80">{nodeLog.error}</p>
                        </div>
                      )}
                    </div>
                  );
                }

                return nodeLog?.output ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last run</span>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        <span className="font-mono text-xs">
                          {nodeLog.startedAt ? new Date(nodeLog.startedAt).toLocaleTimeString() : ""}
                        </span>
                        {nodeLog.duration && (
                          <span className="text-xs text-muted-foreground">
                            ({nodeLog.duration}ms)
                          </span>
                        )}
                      </div>
                    </div>
                    <ResultView
                      value={nodeLog.output}
                      className="max-h-[420px] overflow-auto"
                    />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ChevronRight className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                    <h4 className="font-medium text-sm mb-1">Nothing to show yet</h4>
                    <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                      Run the workflow, or use Test above, to see what this step produces.
                    </p>
                  </div>
                );
              })()}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/**
 * The Test tab for one step.
 *
 * Keyed on the step's id by its parent, so selecting a different step remounts
 * this with fresh state — no effect resetting things, and no chance of one
 * step's sample values leaking into another's.
 */
function StepTester({
  node,
}: {
  node: { id: string; type: string; data: { config?: Record<string, unknown> } };
}) {
  const { nodes } = useWorkflowStore();

  // Seeded from the step's own {{tokens}}: an empty box asks the user to work out
  // what the step needs, which is the opposite of helpful.
  const fields = Object.keys(sampleInputFor(node)).map((name) => ({
    name,
    type: "string" as const,
    label: humanizeFieldName(name),
  }));

  const [input, setInput] = useState<Record<string, unknown>>(() =>
    sampleInputFor(node)
  );
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = async () => {
    setIsTesting(true);
    setResult(null);

    try {
      // Read the live config so unsaved edits are what gets tested.
      const current = nodes.find((n) => n.id === node.id);
      const config = current?.data.config || node.data.config;

      const response = await fetch("/api/nodes/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: node.type,
          nodeId: node.id,
          config,
          input,
        }),
      });

      setResult(await response.json());
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Test failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Sample details</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Try this step on its own, without running the whole workflow.
        </p>

        {fields.length > 0 ? (
          <RunForm fields={fields} values={input} onChange={setInput} />
        ) : (
          <div className="rounded-md border p-3">
            <ValueEditor
              value={input}
              onChange={(next) =>
                setInput((next ?? {}) as Record<string, unknown>)
              }
              kind="group"
            />
          </div>
        )}
      </div>

      <Button onClick={runTest} disabled={isTesting} className="w-full gap-2">
        {isTesting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Run test
          </>
        )}
      </Button>

      {result && (
        <div className="space-y-3">
          <div
            className={cn(
              "rounded-lg p-3 flex items-center gap-2",
              result.success
                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                : "bg-red-500/10 text-red-700 dark:text-red-400"
            )}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">
              {result.success ? "It worked" : "It didn't work"}
            </span>
          </div>

          {result.error && (
            <p className="text-xs text-red-600/80">{result.error}</p>
          )}

          {result.output && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                What it produced
              </p>
              <ResultView
                value={result.output}
                className="max-h-[280px] overflow-auto"
              />
            </div>
          )}
        </div>
      )}

      {!result && !isTesting && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Fill in the details above and run a test to see what this step produces.
        </p>
      )}
    </div>
  );
}
