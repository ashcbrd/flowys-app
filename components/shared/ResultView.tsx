"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { humanizeFieldName } from "@/lib/vocabulary";

/**
 * Shows what a step produced, in a form a person can read.
 *
 * Every result panel used to print `JSON.stringify(output, null, 2)` in a
 * monospace block. That put braces, quotes and square brackets in front of
 * exactly the people the rest of this app stopped asking to write JSON — the
 * result of a step is the thing they came to look at.
 *
 * Structure is preserved, not hidden: named values become labelled rows, lists
 * become bullets, nested groups indent. A copy button keeps the underlying data
 * one click away for anyone who needs to paste it somewhere.
 */

/** A text or markdown output step returns { result: "...", format: "..." }. */
function asProse(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const isProseShape =
    typeof record.result === "string" &&
    keys.every((k) => k === "result" || k === "format");

  return isProseShape ? (record.result as string) : null;
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground italic">empty</span>;
  }

  if (typeof value === "boolean") {
    return <span>{value ? "Yes" : "No"}</span>;
  }

  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function ValueBlock({ value, depth }: { value: unknown; depth: number }) {
  if (isPrimitive(value)) return <PrimitiveValue value={value} />;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">nothing</span>;
    }

    // A list of plain values reads best as bullets; a list of groups needs
    // numbering so the reader can tell one item from the next.
    const allPrimitive = value.every(isPrimitive);

    if (allPrimitive) {
      return (
        <ul className="space-y-0.5">
          {value.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-muted-foreground shrink-0">•</span>
              <PrimitiveValue value={item} />
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="border-l-2 pl-3">
            <p className="text-xs text-muted-foreground mb-1">Item {i + 1}</p>
            <ValueBlock value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return <span className="text-muted-foreground italic">nothing</span>;
  }

  return (
    <div className={cn("space-y-2.5", depth > 0 && "pl-3 border-l")}>
      {entries.map(([key, item]) => (
        <div key={key}>
          <p className="text-xs font-medium text-muted-foreground">
            {humanizeFieldName(key)}
          </p>
          <div className="text-sm mt-0.5">
            <ValueBlock value={item} depth={depth + 1} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ResultViewProps {
  value: unknown;
  className?: string;
  /** Hide the copy button where it would crowd the layout. */
  copyable?: boolean;
}

export function ResultView({
  value,
  className,
  copyable = true,
}: ResultViewProps) {
  const [copied, setCopied] = React.useState(false);

  if (value === null || value === undefined) {
    return (
      <p className={cn("text-sm text-muted-foreground italic", className)}>
        Nothing was produced.
      </p>
    );
  }

  const prose = asProse(value);

  const copy = () => {
    const text =
      prose ?? (typeof value === "string" ? value : JSON.stringify(value, null, 2));
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={cn("relative rounded-lg border bg-muted/30 p-3", className)}>
      {copyable && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-1.5 right-1.5 h-7 w-7"
          onClick={copy}
          title="Copy"
          aria-label="Copy result"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      )}

      <div className={cn(copyable && "pr-7")}>
        {prose !== null ? (
          // The step already produced text for a person to read — show it as-is.
          <p className="text-sm whitespace-pre-wrap break-words">{prose}</p>
        ) : (
          <ValueBlock value={value} depth={0} />
        )}
      </div>
    </div>
  );
}
