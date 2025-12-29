"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, FileText, ChevronRight, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SearchResult {
  section: string;
  sectionId: string;
  title: string;
  content: string;
  matchStart: number;
  matchEnd: number;
}

interface DocsSearchProps {
  onNavigate: (sectionId: string) => void;
}

// Searchable content index
const docsContent = [
  // Getting Started
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "What is Flowys?",
    content: "Flowys is a visual workflow builder that lets you automate tasks by connecting different nodes together. Think of it like building with LEGO blocks.",
  },
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "Create Your First Workflow",
    content: "Add Your First Node. Click on any node type in the left sidebar and drag it onto the canvas. Start with an Input node.",
  },
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "Configure the Node",
    content: "Click on any node to open its settings panel on the right. Each node type has different options you can customize.",
  },
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "Connect Nodes Together",
    content: "Drag from the small circle on the right side of one node to the left side of another. This creates a connection that passes data between them.",
  },
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "Run Your Workflow",
    content: "Click the Run button in the top right corner. Enter any input data required, then click Execute to see your workflow in action.",
  },
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "Save Your Work",
    content: "Click Save to keep your workflow. Give it a memorable name so you can find it later.",
  },
  {
    section: "Getting Started",
    sectionId: "getting-started",
    title: "Chat Assistant",
    content: "Click the chat button in the bottom right. Describe what you want to build and AI will help create it.",
  },
  // Node Types
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "Input Node",
    content: "The starting point of your workflow. Define what data your workflow needs to begin. Accept text, numbers, or other data.",
  },
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "API Fetch Node",
    content: "Connect to external services and fetch data from any URL or API. Get data from websites, external services, or databases.",
  },
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "AI / LLM Node",
    content: "Process data using artificial intelligence. Summarize, analyze, generate, or transform content. Use OpenAI, Anthropic, and other providers.",
  },
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "Logic Node",
    content: "Filter, transform, or manipulate your data without AI. Filter items, transform data formats, or apply simple rules.",
  },
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "Output Node",
    content: "Define the final result of your workflow and how it should be formatted. Return processed data as JSON or text.",
  },
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "Webhook Node",
    content: "Send data to external services or trigger actions in other apps. Send Slack notifications, update Google Sheets, trigger Zapier.",
  },
  {
    section: "Node Types",
    sectionId: "nodes",
    title: "Integration Node",
    content: "Connect to third-party apps like Slack, GitHub, Google Sheets using pre-built integrations. Handle authentication automatically.",
  },
  // Integrations
  {
    section: "Integrations",
    sectionId: "integrations",
    title: "Overview",
    content: "Integrations allow you to connect Flowys to external apps like Slack, GitHub, Google Sheets with secure authentication and pre-built actions.",
  },
  {
    section: "Integrations",
    sectionId: "integrations",
    title: "Slack Integration",
    content: "Send messages, create channels, list channels, upload files to Slack using OAuth2 authentication.",
  },
  {
    section: "Integrations",
    sectionId: "integrations",
    title: "GitHub Integration",
    content: "Create issues, create pull requests, list repositories, get and update files in GitHub using OAuth2.",
  },
  {
    section: "Integrations",
    sectionId: "integrations",
    title: "Google Sheets Integration",
    content: "Read range, write range, append rows, create spreadsheets in Google Sheets using OAuth2.",
  },
  {
    section: "Integrations",
    sectionId: "integrations",
    title: "Notion Integration",
    content: "Create pages, query databases, add items, search in Notion using OAuth2 authentication.",
  },
  {
    section: "Integrations",
    sectionId: "integrations",
    title: "Security",
    content: "AES-256 encryption for credentials at rest. OAuth2 tokens, never store passwords. Revoke integrations anytime.",
  },
  // API
  {
    section: "API Reference",
    sectionId: "api",
    title: "Authentication",
    content: "All API requests require an API key. Include your API key in the Authorization header as Bearer token.",
  },
  {
    section: "API Reference",
    sectionId: "api",
    title: "Rate Limits",
    content: "Default 60 requests per minute. Check response headers X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset.",
  },
  {
    section: "API Reference",
    sectionId: "api",
    title: "List Workflows",
    content: "GET /api/v1/workflows - List all workflows with pagination. Requires workflows:read scope.",
  },
  {
    section: "API Reference",
    sectionId: "api",
    title: "Get Workflow",
    content: "GET /api/v1/workflows/:id - Get a specific workflow with full details including nodes and edges.",
  },
  {
    section: "API Reference",
    sectionId: "api",
    title: "Execute Workflow",
    content: "POST /api/v1/workflows/:id/trigger - Execute a workflow with input data. Requires workflows:execute scope.",
  },
  {
    section: "API Reference",
    sectionId: "api",
    title: "API Key Scopes",
    content: "workflows:read, workflows:write, workflows:execute, executions:read, full_access permissions for API keys.",
  },
  // Webhooks
  {
    section: "Webhooks",
    sectionId: "webhooks",
    title: "Incoming Webhooks",
    content: "External services can trigger your workflows by sending data to a unique URL. Use with Zapier, Make, or custom apps.",
  },
  {
    section: "Webhooks",
    sectionId: "webhooks",
    title: "Outgoing Webhooks",
    content: "Flowys sends data to external services when workflows complete. Subscribe to events like workflow.completed.",
  },
  {
    section: "Webhooks",
    sectionId: "webhooks",
    title: "Signature Verification",
    content: "Sign your requests using HMAC-SHA256 with your webhook secret. Include X-Webhook-Signature header.",
  },
  {
    section: "Webhooks",
    sectionId: "webhooks",
    title: "Webhook Events",
    content: "workflow.started, workflow.completed, workflow.failed, node.completed, node.failed events available.",
  },
  {
    section: "Webhooks",
    sectionId: "webhooks",
    title: "Retry Policy",
    content: "Failed webhook deliveries are automatically retried with exponential backoff up to 4 attempts.",
  },
];

export function DocsSearch({ onNavigate }: DocsSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search and filter results
  const results = useMemo(() => {
    if (!query.trim()) return [];

    const searchTerm = query.toLowerCase();
    const matches: SearchResult[] = [];

    docsContent.forEach((item) => {
      const contentLower = item.content.toLowerCase();
      const titleLower = item.title.toLowerCase();

      // Check title match
      const titleIndex = titleLower.indexOf(searchTerm);
      if (titleIndex !== -1) {
        matches.push({
          ...item,
          matchStart: titleIndex,
          matchEnd: titleIndex + searchTerm.length,
        });
        return;
      }

      // Check content match
      const contentIndex = contentLower.indexOf(searchTerm);
      if (contentIndex !== -1) {
        matches.push({
          ...item,
          matchStart: contentIndex,
          matchEnd: contentIndex + searchTerm.length,
        });
      }
    });

    return matches.slice(0, 10); // Limit to 10 results
  }, [query]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Handle keyboard shortcut to open (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle keyboard navigation in modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.sectionId);
    setQuery("");
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery("");
  };

  // Highlight matching text
  const highlightMatch = (text: string, start: number, end: number) => {
    if (start < 0) return text;

    const before = text.slice(0, start);
    const match = text.slice(start, end);
    const after = text.slice(end);

    return (
      <>
        {before}
        <mark className="bg-blue-200 dark:bg-blue-700 text-foreground font-medium rounded px-0.5">
          {match}
        </mark>
        {after}
      </>
    );
  };

  const getContextSnippet = (result: SearchResult) => {
    const { content, matchStart, matchEnd } = result;
    const searchTerm = query.toLowerCase();

    // If match is in title
    if (result.title.toLowerCase().includes(searchTerm)) {
      return content.slice(0, 100) + (content.length > 100 ? "..." : "");
    }

    // Show context around the match
    const contextStart = Math.max(0, matchStart - 40);
    const contextEnd = Math.min(content.length, matchEnd + 60);
    let snippet = content.slice(contextStart, contextEnd);

    if (contextStart > 0) snippet = "..." + snippet;
    if (contextEnd < content.length) snippet = snippet + "...";

    // Find match position in snippet
    const snippetMatchStart = matchStart - contextStart + (contextStart > 0 ? 3 : 0);
    const snippetMatchEnd = snippetMatchStart + (matchEnd - matchStart);

    return highlightMatch(snippet, snippetMatchStart, snippetMatchEnd);
  };

  return (
    <>
      {/* Search Button */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search docs...</span>
        <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
          <Command className="h-3 w-3" />K
        </kbd>
      </Button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}

      {/* Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div
            className={cn(
              "w-full max-w-2xl mx-4",
              "bg-background border rounded-xl shadow-2xl",
              "animate-in fade-in-0 zoom-in-95 duration-200"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-4 border-b">
              <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documentation..."
                className={cn(
                  "flex-1 text-lg bg-transparent",
                  "focus:outline-none",
                  "placeholder:text-muted-foreground"
                )}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex h-6 items-center rounded border bg-muted px-2 font-mono text-xs text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {query && results.length > 0 && (
                <div className="py-2">
                  {results.map((result, index) => (
                    <button
                      key={`${result.sectionId}-${result.title}-${index}`}
                      onClick={() => handleSelect(result)}
                      className={cn(
                        "w-full text-left px-4 py-3",
                        "transition-colors",
                        index === selectedIndex
                          ? "bg-blue-50 dark:bg-blue-950/50"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {result.section}
                        </span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">
                          {result.title.toLowerCase().includes(query.toLowerCase())
                            ? highlightMatch(
                                result.title,
                                result.title.toLowerCase().indexOf(query.toLowerCase()),
                                result.title.toLowerCase().indexOf(query.toLowerCase()) + query.length
                              )
                            : result.title}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground ml-6 line-clamp-2">
                        {getContextSnippet(result)}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* No results */}
              {query && results.length === 0 && (
                <div className="py-12 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    No results found for "<span className="font-medium text-foreground">{query}</span>"
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Try searching for something else
                  </p>
                </div>
              )}

              {/* Empty state */}
              {!query && (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">
                    Start typing to search the documentation
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {["workflow", "API", "webhook", "integration", "node"].map((term) => (
                      <button
                        key={term}
                        onClick={() => setQuery(term)}
                        className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">↓</kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">↵</kbd>
                  to select
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-background border rounded text-[10px]">esc</kbd>
                to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
