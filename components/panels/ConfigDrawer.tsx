"use client";

import { useEffect, useState } from "react";
import { X, Settings, Zap, FlaskConical, ChevronRight, Loader2, CheckCircle2, XCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NodeConfigPanel } from "@/components/panels/NodeConfigPanel";
import { useWorkflowStore } from "@/store/workflow";
import { cn } from "@/lib/utils";

interface TestResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

export function ConfigDrawer() {
  const { selectedNode, lastExecution, executionLogs, nodes } = useWorkflowStore();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("setup");
  const [testInput, setTestInput] = useState("{}");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Open drawer when a node is selected
  useEffect(() => {
    if (selectedNode) {
      setIsOpen(true);
    }
  }, [selectedNode]);

  // Reset test state when node changes
  useEffect(() => {
    setTestInput("{}");
    setTestResult(null);
  }, [selectedNode?.id]);

  // Close drawer handler
  const handleClose = () => {
    setIsOpen(false);
  };

  // Run test handler
  const handleRunTest = async () => {
    if (!selectedNode) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(testInput);
      } catch {
        setTestResult({
          success: false,
          error: "Invalid JSON input",
        });
        setIsTesting(false);
        return;
      }

      // Get the current node config from the store (in case it was modified)
      const currentNode = nodes.find((n) => n.id === selectedNode.id);
      const config = currentNode?.data.config || selectedNode.data.config;

      const response = await fetch("/api/nodes/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeType: selectedNode.type,
          nodeId: selectedNode.id,
          config,
          input,
        }),
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Test failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!selectedNode) {
    return null;
  }

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
                  "Configure Node"}
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
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Test Input (JSON)</Label>
                <Textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder='{"text": "Hello, world!"}'
                  className="mt-1.5 font-mono text-sm h-24"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Provide sample data to test this node in isolation
                </p>
              </div>

              <Button
                onClick={handleRunTest}
                disabled={isTesting}
                className="w-full gap-2"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running Test...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Test
                  </>
                )}
              </Button>

              {testResult && (
                <div className="space-y-3">
                  <div
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg",
                      testResult.success
                        ? "bg-green-500/10 text-green-600"
                        : "bg-red-500/10 text-red-600"
                    )}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <XCircle className="h-5 w-5" />
                    )}
                    <div className="flex-1">
                      <span className="font-medium text-sm">
                        {testResult.success ? "Test Passed" : "Test Failed"}
                      </span>
                      {testResult.duration && (
                        <span className="text-xs ml-2 opacity-75">
                          ({testResult.duration}ms)
                        </span>
                      )}
                    </div>
                  </div>

                  {testResult.error && (
                    <div className="p-3 bg-red-500/10 rounded-lg">
                      <p className="text-xs font-medium text-red-600 mb-1">
                        Error
                      </p>
                      <p className="text-xs text-red-600/80">
                        {testResult.error}
                      </p>
                    </div>
                  )}

                  {testResult.output && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Output
                      </p>
                      <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto max-h-[200px]">
                        {JSON.stringify(testResult.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {!testResult && (
                <div className="text-center py-4 text-muted-foreground">
                  <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">
                    Configure your input and run a test to see results
                  </p>
                </div>
              )}
            </div>
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
                    <pre className="bg-muted rounded-lg p-3 text-xs overflow-auto max-h-[400px]">
                      {JSON.stringify(nodeLog.output, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ChevronRight className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                    <h4 className="font-medium text-sm mb-1">No Output Yet</h4>
                    <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                      Run the workflow to see the output from this node.
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
