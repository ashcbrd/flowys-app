"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, Loader2, Bot, Zap, AlertTriangle, CheckCircle, Wand2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkflowStore, type NodeType, type GeneratedWorkflow } from "@/store/workflow";
import { useToast } from "@/hooks/use-toast";
import { useUpgradeModal } from "@/components/shared/UpgradeModal";

type PlanType = "free" | "builder" | "team";

interface FixAction {
  type: string;
  nodeId?: string;
  nodeType?: NodeType;
  changes?: Record<string, unknown>;
  position?: { x: number; y: number };
  description: string;
}

interface WorkflowGeneration {
  nodes: Array<{
    id: string;
    type: NodeType;
    position: { x: number; y: number };
    data: {
      label: string;
      config: Record<string, unknown>;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  description: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  errorAnalysis?: {
    hasError: boolean;
    errorNode?: string;
    errorMessage?: string;
    errorReason?: string;
  };
  suggestedFix?: {
    explanation: string;
    manualSteps: string[];
    autoFix?: FixAction;
  };
  workflowGeneration?: WorkflowGeneration;
  suggestions?: string[];
}

interface ChatResponse {
  message: string;
  errorAnalysis?: {
    hasError: boolean;
    errorNode?: string;
    errorMessage?: string;
    errorReason?: string;
  };
  suggestedFix?: {
    explanation: string;
    manualSteps: string[];
    autoFix?: FixAction;
  };
  workflowGeneration?: WorkflowGeneration;
  suggestions?: string[];
}

// Using Next.js API routes - no external API base needed

const DEFAULT_SUGGESTIONS = [
  "Create a text analysis workflow",
  "Build a simple AI chatbot workflow",
  "What node types are available?",
  "Help me fix my workflow",
];

export function FluxWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userPlan, setUserPlan] = useState<PlanType>("free");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    nodes,
    edges,
    executionLogs,
    lastExecution,
    updateNodeConfig,
    addNode,
    updateNodeLabel,
    createWorkflow,
  } = useWorkflowStore();
  const { toast } = useToast();
  const { openUpgradeModal } = useUpgradeModal();

  // Fetch user's subscription plan
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const data = await res.json();
          setUserPlan(data.subscription?.plan || "free");
        }
      } catch {
        setUserPlan("free");
      }
    };
    fetchPlan();
  }, []);

  const isLocked = userPlan === "free";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (isLocked) {
        // Free tier message
        setMessages([
          {
            role: "assistant",
            content:
              "Hey! I'm Flux, your AI workflow assistant. I can create workflows for you, help you debug issues, and answer questions about building automations.\n\nI'd love to help you, but I'm only available on the Builder and Team plans. Upgrade your plan and I'll be ready to create amazing workflows with you!",
            suggestions: [],
          },
        ]);
      } else {
        // Paid tier message
        setMessages([
          {
            role: "assistant",
            content:
              "Hey! I'm Flux, your workflow assistant. I can create workflows for you, help you debug issues, and answer questions. Try asking me to create a workflow!",
            suggestions: DEFAULT_SUGGESTIONS,
          },
        ]);
      }
    }
    if (isOpen && !isLocked) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages.length, isLocked]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/flux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          workflow: { nodes, edges },
          executionLogs: executionLogs,
          lastExecution: lastExecution ? {
            status: lastExecution.status,
            error: lastExecution.error,
            output: lastExecution.output,
          } : null,
          conversationHistory: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = response.status;

        let errorMessage = "";
        let errorSuggestions: string[] = [];

        if (status === 401 || status === 403) {
          errorMessage = "I can't access the AI service right now. This usually means the API key needs to be set up. Please ask your administrator to check the API configuration.";
          errorSuggestions = ["What is an API key?", "Help me understand this error"];
        } else if (status === 429) {
          errorMessage = "I'm getting too many requests right now. Please wait a moment and try again - this usually resolves itself in a minute or two.";
          errorSuggestions = ["Try again in a moment", "What else can you do?"];
        } else if (status === 500 || status === 502 || status === 503) {
          errorMessage = "Something went wrong on my end. This is temporary - please try again in a few seconds.";
          errorSuggestions = ["Try again", "What can you help with?"];
        } else if (status === 400) {
          errorMessage = errorData.error || "I didn't understand that request. Could you try rephrasing your question?";
          errorSuggestions = ["Help me create a workflow", "What can you do?"];
        } else {
          errorMessage = "I ran into an unexpected issue. Please try again, and if the problem continues, let your administrator know.";
          errorSuggestions = ["Try again", "What can you help with?"];
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: errorMessage, suggestions: errorSuggestions },
        ]);
        return;
      }

      const data: ChatResponse = await response.json();

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.message,
        errorAnalysis: data.errorAnalysis,
        suggestedFix: data.suggestedFix,
        workflowGeneration: data.workflowGeneration,
        suggestions: data.suggestions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      let errorMessage = "";
      let errorSuggestions: string[] = [];

      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "I can't reach the server right now. Please check your internet connection and try again.";
        errorSuggestions = ["Try again", "Check my connection"];
      } else if (error instanceof Error && error.name === "AbortError") {
        errorMessage = "The request took too long and timed out. This might happen with complex workflows. Please try again.";
        errorSuggestions = ["Try again", "Simplify my request"];
      } else {
        errorMessage = "Something unexpected happened. Please try again - if this keeps occurring, try refreshing the page.";
        errorSuggestions = ["Try again", "What can you help with?"];
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMessage, suggestions: errorSuggestions },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyFix = (fix: FixAction) => {
    try {
      switch (fix.type) {
        case "add_node":
          if (fix.nodeType) {
            const position = fix.position || { x: 300, y: 200 };
            addNode(fix.nodeType, position);
            toast({
              title: "Fix Applied",
              description: fix.description || `Added ${fix.nodeType} node`,
            });
            addAssistantMessage(
              `Done! I've added a ${fix.nodeType} node. ${fix.description}`,
              ["Run workflow again", "Check for more issues"]
            );
          }
          break;

        case "update_config":
          if (fix.nodeId && fix.changes) {
            const node = nodes.find((n) => n.id === fix.nodeId);
            if (node) {
              const newConfig = { ...node.data.config, ...fix.changes };
              updateNodeConfig(fix.nodeId, newConfig);
              toast({
                title: "Fix Applied",
                description: fix.description || `Updated "${node.data.label}"`,
              });
              addAssistantMessage(
                `Fixed! ${fix.description} Try running your workflow again.`,
                ["Run workflow", "Check for more issues"]
              );
            }
          }
          break;

        case "rename_node":
          if (fix.nodeId && fix.changes?.label) {
            updateNodeLabel(fix.nodeId, fix.changes.label as string);
            toast({
              title: "Fix Applied",
              description: fix.description || "Node renamed",
            });
            addAssistantMessage(
              `Done! ${fix.description}`,
              ["What else can you help with?"]
            );
          }
          break;

        default:
          toast({
            title: "Manual Fix Required",
            description: "Please follow the manual steps provided",
          });
      }
    } catch (error) {
      toast({
        title: "Fix Failed",
        description: "Could not apply the fix automatically. Please try manually.",
        variant: "destructive",
      });
    }
  };

  const handleCreateWorkflow = (workflow: WorkflowGeneration) => {
    try {
      const generatedWorkflow: GeneratedWorkflow = {
        nodes: workflow.nodes,
        edges: workflow.edges,
      };

      createWorkflow(generatedWorkflow);

      toast({
        title: "Workflow Created!",
        description: workflow.description || "Your workflow has been added to the canvas",
      });

      addAssistantMessage(
        `I've created the workflow on your canvas. You can click on each node to see and customize its configuration. When you're ready, click "Run" to execute it!`,
        ["Run the workflow", "Explain this workflow", "Modify a node"]
      );
    } catch (error) {
      toast({
        title: "Failed to Create Workflow",
        description: "There was an error creating the workflow",
        variant: "destructive",
      });
    }
  };

  const addAssistantMessage = (content: string, suggestions?: string[]) => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content, suggestions },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-[9999] flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all duration-300 text-white",
            "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 hover:scale-105 active:scale-95"
          )}
        >
          <Bot className="h-5 w-5" />
          <span className="font-medium">Ask Flux</span>
          {isLocked && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 font-bold">PRO</span>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col w-[420px] h-[600px] bg-background border rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Flux</h3>
                <p className="text-xs text-white/70">Workflow Assistant</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-white" />
                    </div>
                    <span>Flux</span>
                  </div>
                )}

                {/* Main Message */}
                <div
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-br-md"
                      : "bg-muted rounded-tl-md"
                  )}
                >
                  {msg.content}
                </div>

                {/* Workflow Generation Section */}
                {msg.workflowGeneration && (
                  <div className="max-w-[90%] mt-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium text-sm mb-2">
                      <Wand2 className="h-4 w-4" />
                      Workflow Ready
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                      {msg.workflowGeneration.description}
                    </p>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                      <strong>{msg.workflowGeneration.nodes.length}</strong> nodes &bull;{" "}
                      <strong>{msg.workflowGeneration.edges.length}</strong> connections
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleCreateWorkflow(msg.workflowGeneration!)}
                      className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white border-0 rounded-lg"
                    >
                      <Wand2 className="h-3 w-3 mr-2" />
                      Create This Workflow
                    </Button>
                  </div>
                )}

                {/* Error Analysis Section */}
                {msg.errorAnalysis?.hasError && (
                  <div className="max-w-[90%] mt-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium text-sm mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      Error Found
                    </div>
                    {msg.errorAnalysis.errorNode && (
                      <p className="text-xs text-red-600 dark:text-red-400 mb-1">
                        <strong>Node:</strong> {msg.errorAnalysis.errorNode}
                      </p>
                    )}
                    {msg.errorAnalysis.errorMessage && (
                      <p className="text-xs text-red-600 dark:text-red-400 mb-1">
                        <strong>Error:</strong> {msg.errorAnalysis.errorMessage}
                      </p>
                    )}
                    {msg.errorAnalysis.errorReason && (
                      <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                        <strong>Why:</strong> {msg.errorAnalysis.errorReason}
                      </p>
                    )}
                  </div>
                )}

                {/* Suggested Fix Section */}
                {msg.suggestedFix && (
                  <div className="max-w-[90%] mt-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium text-sm mb-2">
                      <CheckCircle className="h-4 w-4" />
                      How to Fix
                    </div>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                      {msg.suggestedFix.explanation}
                    </p>
                    {msg.suggestedFix.manualSteps && msg.suggestedFix.manualSteps.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Manual steps:</p>
                        <ol className="text-xs text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-1">
                          {msg.suggestedFix.manualSteps.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {msg.suggestedFix.autoFix && (
                      <Button
                        size="sm"
                        onClick={() => handleApplyFix(msg.suggestedFix!.autoFix!)}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-0 rounded-lg mt-2"
                      >
                        <Zap className="h-3 w-3 mr-2" />
                        Apply Fix Automatically
                      </Button>
                    )}
                  </div>
                )}

                {/* Suggestion Chips */}
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.suggestions.slice(0, 4).map((suggestion, j) => (
                      <button
                        key={j}
                        onClick={() => sendMessage(suggestion)}
                        disabled={isLoading}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full transition-all",
                          "bg-secondary hover:bg-primary hover:text-primary-foreground",
                          "border border-border hover:border-primary",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Sparkles className="h-3 w-3 text-white" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-muted/30">
            {isLocked ? (
              // Free tier - show upgrade prompt
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
                  <Lock className="h-4 w-4" />
                  <span className="text-sm font-medium">Upgrade to unlock Flux</span>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    openUpgradeModal();
                  }}
                  className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  Upgrade Now
                </button>
                <p className="text-[10px] text-muted-foreground">
                  Get AI-powered workflow creation, debugging, and more
                </p>
              </div>
            ) : (
              // Paid tier - show input
              <>
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me to create a workflow..."
                    disabled={isLoading}
                    rows={1}
                    className={cn(
                      "flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm",
                      "focus:outline-none focus:ring-2 focus:ring-primary",
                      "placeholder:text-muted-foreground",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "max-h-32"
                    )}
                    style={{ minHeight: "44px" }}
                  />
                  <Button
                    size="icon"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isLoading}
                    className="h-11 w-11 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Try: "Create a workflow that summarizes articles"
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
