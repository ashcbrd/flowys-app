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
        /* The preview has to keep the shape of what was typed, line breaks and
           all, so it is ordinary flowing text rather than a flex row. A flex row
           turned every line into its own item and pushed the labels out of the
           sentence they belong to. */
        <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
          <span className="fy-eyebrow mb-1 block">Preview</span>
          <span className="block whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
            {segments.map((segment, i) =>
              segment.kind === "text" ? (
                <React.Fragment key={i}>{segment.value}</React.Fragment>
              ) : (
                <span
                  key={i}
                  className={cn(
                    "mx-0.5 rounded px-1.5 py-0.5 align-middle font-medium",
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
                  {humanizeFieldName(
                    segment.path.split(".").pop() || segment.path
                  )}
                </span>
              )
            )}
          </span>
        </div>
      )}
    </div>
  );
}
