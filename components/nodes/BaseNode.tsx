"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Check, AlertCircle } from "lucide-react";

interface BaseNodeProps extends NodeProps {
  icon: ReactNode;
  color: string;
  gradient?: string;
  hasInput?: boolean;
  hasOutput?: boolean;
}

export function BaseNode({
  data,
  selected,
  icon,
  color,
  gradient,
  hasInput = true,
  hasOutput = true,
}: BaseNodeProps) {
  const config = data.config as Record<string, unknown>;
  const isConfigured = checkIfConfigured(config);
  const preview = getNodePreview(config);
  const subtitle = getNodeSubtitle(config);

  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[280px] rounded-2xl bg-card transition-all duration-200",
        // Border styling
        "border-2",
        selected
          ? "border-primary shadow-lg shadow-primary/20"
          : "border-border/50 shadow-md",
        // Hover effect
        "hover:shadow-lg hover:border-border"
      )}
    >
      {/* Header with icon and label */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-t-xl",
          "bg-gradient-to-r",
          gradient || color
        )}
      >
        <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-inner">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white truncate">
              {data.label as string}
            </span>
            {/* Configuration status indicator */}
            {isConfigured ? (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/20">
                <Check className="w-2.5 h-2.5 text-white" />
              </span>
            ) : (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400/80">
                <AlertCircle className="w-2.5 h-2.5 text-amber-900" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Preview content */}
      <div className="px-4 py-3 space-y-2">
        {preview ? (
          <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
            {preview}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">
            Click to configure
          </p>
        )}

        {/* Subtitle info */}
        {subtitle && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span className="truncate">{subtitle}</span>
          </div>
        )}
      </div>

      {/* Handles */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            "!w-3 !h-3 !bg-primary !border-2 !border-background",
            "!-left-1.5"
          )}
        />
      )}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            "!w-3 !h-3 !bg-primary !border-2 !border-background",
            "!-right-1.5"
          )}
        />
      )}
    </div>
  );
}

function checkIfConfigured(config: Record<string, unknown>): boolean {
  if (!config || Object.keys(config).length === 0) return false;

  // Check for AI node configuration
  if (config.provider && config.model) return true;

  // Check for API node configuration
  if (config.url) return true;

  // Check for Logic node configuration
  if (config.operation) return true;

  // Check for Input node configuration
  if (config.fields && Array.isArray(config.fields) && config.fields.length > 0) return true;

  // Check for Integration node configuration
  if (config.connectionId && config.actionId) return true;

  // Check for Webhook node configuration
  if (config.webhookUrl) return true;

  // Check for Output node configuration
  if (config.format) return true;

  return false;
}

function getNodePreview(config: Record<string, unknown>): string | null {
  // AI node - show prompt preview
  if (config.prompt) {
    const prompt = config.prompt as string;
    return prompt.length > 60 ? `"${prompt.slice(0, 60)}..."` : `"${prompt}"`;
  }

  // API node - show URL
  if (config.url) {
    const url = config.url as string;
    try {
      const hostname = new URL(url).hostname;
      return `Fetching from ${hostname}`;
    } catch {
      return `Calling ${url.slice(0, 40)}${url.length > 40 ? "..." : ""}`;
    }
  }

  // Integration node
  if (config.actionName) {
    return config.actionName as string;
  }

  // Logic node - show operation
  if (config.operation) {
    const ops: Record<string, string> = {
      transform: "Transform data",
      filter: "Filter items",
      conditional: "Check condition",
      loop: "Loop through items",
      merge: "Merge data",
    };
    return ops[config.operation as string] || (config.operation as string);
  }

  // Input node - show field count
  if (config.fields && Array.isArray(config.fields)) {
    const count = config.fields.length;
    return count === 1 ? "1 input field" : `${count} input fields`;
  }

  // Output node - show format
  if (config.format) {
    return `Output as ${config.format}`;
  }

  // Webhook node
  if (config.webhookUrl) {
    try {
      const hostname = new URL(config.webhookUrl as string).hostname;
      return `Send to ${hostname}`;
    } catch {
      return "Send webhook";
    }
  }

  return null;
}

function getNodeSubtitle(config: Record<string, unknown>): string | null {
  // AI node - show provider and model
  if (config.provider && config.model) {
    return `${config.provider} / ${config.model}`;
  }

  // API node - show method
  if (config.method) {
    return config.method as string;
  }

  // Integration node - show integration name
  if (config.integrationName) {
    return config.integrationName as string;
  }

  // Webhook node - show method
  if (config.webhookMethod) {
    return config.webhookMethod as string;
  }

  return null;
}
