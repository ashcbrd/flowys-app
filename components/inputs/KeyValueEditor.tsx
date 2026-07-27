"use client";

import * as React from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Add/remove rows of name-and-value pairs.
 *
 * Extracted from the Headers editor that already existed in NodeConfigPanel, so
 * response mappings and webhook payloads get the same treatment instead of a
 * JSON textarea.
 */

export interface KeyValueEditorProps {
  value: Record<string, unknown> | undefined;
  onChange: (value: Record<string, unknown> | undefined) => void;
  label: string;
  /** Explains the purpose in plain language, shown under the label. */
  help?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  emptyMessage?: string;
  addLabel?: string;
  /** Replace the value control, used to inject a template/field picker. */
  renderValue?: (props: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
  }) => React.ReactNode;
  /** Show an arrow between key and value to suggest "this comes from that". */
  showArrow?: boolean;
}

interface Row {
  key: string;
  value: string;
}

export function KeyValueEditor({
  value,
  onChange,
  label,
  help,
  keyPlaceholder = "Name",
  valuePlaceholder = "Value",
  emptyMessage = "Nothing here yet",
  addLabel = "Add",
  renderValue,
  showArrow = false,
}: KeyValueEditorProps) {
  // Rows are local state so a half-typed or temporarily empty key doesn't get
  // dropped by the object round-trip on every keystroke.
  const [rows, setRows] = React.useState<Row[]>(() =>
    Object.entries(value || {}).map(([key, v]) => ({
      key,
      value: v === null || v === undefined ? "" : String(v),
    }))
  );

  const commit = (next: Row[]) => {
    setRows(next);

    const result: Record<string, unknown> = {};
    for (const row of next) {
      if (row.key.trim() === "") continue;
      result[row.key] = row.value;
    }

    onChange(Object.keys(result).length > 0 ? result : undefined);
  };

  const update = (index: number, patch: Partial<Row>) => {
    commit(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const remove = (index: number) => {
    commit(rows.filter((_, i) => i !== index));
  };

  const add = () => {
    setRows([...rows, { key: "", value: "" }]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>{label}</Label>
        <Button size="sm" variant="outline" onClick={add} className="gap-1">
          <Plus className="h-3 w-3" />
          {addLabel}
        </Button>
      </div>

      {help && (
        <p className="text-xs text-muted-foreground mb-2">{help}</p>
      )}

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
          {emptyMessage}
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Input
              className="h-8 flex-1"
              value={row.key}
              placeholder={keyPlaceholder}
              onChange={(e) => update(i, { key: e.target.value })}
            />

            {showArrow && (
              <ArrowRight className="h-3 w-3 text-muted-foreground mt-2.5 shrink-0" />
            )}

            <div className="flex-1">
              {renderValue ? (
                renderValue({
                  value: row.value,
                  onChange: (next) => update(i, { value: next }),
                  placeholder: valuePlaceholder,
                })
              ) : (
                <Input
                  className="h-8"
                  value={row.value}
                  placeholder={valuePlaceholder}
                  onChange={(e) => update(i, { value: e.target.value })}
                />
              )}
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => remove(i)}
              aria-label={`Remove ${row.key || "row"}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
