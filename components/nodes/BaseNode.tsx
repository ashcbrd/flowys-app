"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Check, AlertCircle } from "lucide-react";
import {
  LOGIC_OPERATIONS,
  IMAGE_SIZES,
  IMAGE_QUALITIES,
  EMAIL_LAYOUTS_TERMS,
  labelFor,
} from "@/lib/vocabulary";

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
        // A hairline border and a low, wide shadow, the same card treatment the
        // landing site uses. Selection is carried by a ring so the card's own
        // geometry never shifts.
        "overflow-hidden border",
        selected
          ? "border-[var(--fy-blue)] ring-2 ring-[rgba(10,108,255,0.18)] shadow-[0_18px_44px_-24px_rgba(0,61,176,0.45)]"
          : "border-border shadow-[0_10px_30px_-22px_rgba(11,17,32,0.35)]",
        // Hover effect
        "hover:shadow-[0_18px_44px_-26px_rgba(0,61,176,0.4)]"
      )}
    >
      {/* Header with icon and label */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
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
            Click to set up
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

  // An AI step is set up once it has an instruction. The provider and model are
  // resolved by the engine, so their absence no longer means "unconfigured".
  if (config.userPromptTemplate) return true;

  // A picture step is set up once it has a description.
  if (config.promptTemplate) return true;

  // A brand kit step defaults to the picture that arrives from the previous
  // step, so having a source at all counts as configured.
  if (config.sourceTemplate) return true;

  // An email step is set up once it has a subject and body.
  if (config.subjectTemplate && config.bodyTemplate) return true;

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
  // AI and picture steps, show the instruction. The last non-empty line is
  // conventionally the ask ("Find the themes across all of these."); earlier
  // lines are the data being handed over, which makes a poor summary.
  const instruction = (config.userPromptTemplate ??
    config.promptTemplate ??
    config.prompt) as string | undefined;

  if (typeof instruction === "string" && instruction.trim()) {
    const lines = instruction
      .replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, "…")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const ask = lines[lines.length - 1];
    if (ask) return ask.length > 70 ? `${ask.slice(0, 70)}…` : ask;
  }

  // API and webhook steps both store a `url`, but they face opposite ways:
  // one reads, one delivers. A webhook card saying "Fetching from" describes
  // the wrong direction, so tell them apart by the keys only a webhook has.
  if (config.url) {
    const url = config.url as string;
    const isWebhook =
      config.payloadTemplate !== undefined || config.continueOnError !== undefined;
    try {
      const hostname = new URL(url).hostname;
      return isWebhook ? `Sends the result to ${hostname}` : `Fetching from ${hostname}`;
    } catch {
      return `Calling ${url.slice(0, 40)}${url.length > 40 ? "..." : ""}`;
    }
  }

  // Integration node
  if (config.actionName) {
    return config.actionName as string;
  }

  // Email step - the subject is the summary.
  if (typeof config.subjectTemplate === "string" && config.subjectTemplate.trim()) {
    return config.subjectTemplate.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, "…");
  }

  // Brand kit step - say what it does; its config is mostly defaults.
  if (config.sourceTemplate) {
    return "Mockups, palette, and a brand board";
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

export function getNodeSubtitle(config: Record<string, unknown>): string | null {
  // Logic step, name the operation from the vocabulary. Never the stored value
  // ("condition", "filter"), which is developer jargon on the canvas.
  if (typeof config.operation === "string") {
    return labelFor(LOGIC_OPERATIONS, config.operation);
  }

  // Picture step: the shape and quality it will make.
  if (typeof config.promptTemplate === "string") {
    const size = labelFor(IMAGE_SIZES, (config.size as string) || "square");
    const quality = labelFor(IMAGE_QUALITIES, (config.quality as string) || "standard");
    return `${size} · ${quality}`;
  }

  // Email step: which look it assembles.
  if (typeof config.subjectTemplate === "string") {
    return labelFor(EMAIL_LAYOUTS_TERMS, (config.layout as string) || "newsletter");
  }

  // AI step, how many named values it hands to the next step.
  const schema = config.outputSchema as
    | { properties?: Record<string, unknown> }
    | undefined;

  if (schema?.properties) {
    const count = Object.keys(schema.properties).length;
    if (count > 0) {
      return count === 1 ? "Gives back 1 value" : `Gives back ${count} values`;
    }
  }

  // API node - say what the request does rather than naming the HTTP verb.
  if (config.method) {
    const plain: Record<string, string> = {
      GET: "Reads data",
      POST: "Sends data",
      PUT: "Replaces data",
      PATCH: "Updates data",
      DELETE: "Deletes data",
    };
    return plain[config.method as string] ?? null;
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
