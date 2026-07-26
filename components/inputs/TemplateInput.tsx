"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FieldPicker } from "./FieldPicker";
import { parseTemplate, toToken } from "@/lib/utils/template";
import { humanizeFieldName } from "@/lib/vocabulary";
import type { AvailableField } from "@/lib/utils/fields";

/**
 * Text input that can contain references to values from earlier steps.
 *
 * The stored string keeps the engine's `{{token}}` grammar untouched, but the
 * user inserts references from a picker and sees them rendered as readable chips
 * in a preview line beneath the field.
 */

interface TemplateInputProps {
  value: string;
  onChange: (value: string) => void;
  fields: AvailableField[];
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

export function TemplateInput({
  value,
  onChange,
  fields,
  placeholder,
  multiline = false,
  rows = 4,
  className,
}: TemplateInputProps) {
  const ref = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const insert = (path: string) => {
    const token = toToken(path);
    const element = ref.current;

    // Insert at the caret when we know where it is, otherwise append.
    const start = element?.selectionStart;
    const end = element?.selectionEnd;

    if (element && typeof start === "number" && typeof end === "number") {
      const next = value.slice(0, start) + token + value.slice(end);
      onChange(next);

      // Restore the caret after the inserted token.
      requestAnimationFrame(() => {
        element.focus();
        const caret = start + token.length;
        element.setSelectionRange(caret, caret);
      });
      return;
    }

    onChange(value ? `${value}${token}` : token);
  };

  const segments = parseTemplate(value || "");
  const hasTokens = segments.some((s) => s.kind === "variable");

  const knownPath = (path: string) =>
    fields.some((f) => f.path === path);

  return (
    <div className={cn("space-y-2", className)}>
      {multiline ? (
        <Textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          ref={ref as React.Ref<HTMLInputElement>}
          className="h-8"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      <FieldPicker fields={fields} onSelect={insert} />

      {hasTokens && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="mr-1">Preview:</span>
          {segments.map((segment, i) =>
            segment.kind === "text" ? (
              <span key={i} className="whitespace-pre-wrap">
                {segment.value}
              </span>
            ) : (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 font-medium",
                  knownPath(segment.path)
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive"
                )}
                title={
                  knownPath(segment.path)
                    ? undefined
                    : "No earlier step provides this value"
                }
              >
                {humanizeFieldName(segment.path.split(".").pop() || segment.path)}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
