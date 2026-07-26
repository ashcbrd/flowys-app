"use client";

import * as React from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { humanizeFieldName } from "@/lib/vocabulary";

/**
 * Recursive editor for any value a workflow config can hold.
 *
 * This mirrors the grammar of JSON itself — object, array, text, number, yes/no —
 * rather than enumerating known config shapes. That is what lets us remove every
 * JSON textarea without any setting becoming unreachable: there is no value this
 * cannot represent.
 */

export type ValueKind = "text" | "number" | "boolean" | "list" | "group";

const KIND_LABELS: { value: ValueKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
  { value: "list", label: "List of items" },
  { value: "group", label: "Group of fields" },
];

export function kindOf(value: unknown): ValueKind {
  if (Array.isArray(value)) return "list";
  if (value !== null && typeof value === "object") return "group";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "text";
}

function emptyValueFor(kind: ValueKind): unknown {
  switch (kind) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "list":
      return [];
    case "group":
      return {};
    default:
      return "";
  }
}

/** Convert between kinds without losing more than necessary. */
function coerceTo(value: unknown, kind: ValueKind): unknown {
  switch (kind) {
    case "text":
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return "";
      return String(value);
    case "number": {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return Boolean(value) && value !== "false";
    case "list":
      if (Array.isArray(value)) return value;
      return value === "" || value === null || value === undefined ? [] : [value];
    case "group":
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
      return {};
  }
}

/** Ensure a new key doesn't collide with an existing one. */
function uniqueKey(existing: string[], base = "field"): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

interface ValueEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  /** Rendered above the control when this is a named field. */
  label?: string;
  placeholder?: string;
  /** Show the type switcher. Hidden when the type is fixed by a schema. */
  allowKindChange?: boolean;
  /** Fix the editor to one kind. */
  kind?: ValueKind;
  /** Custom control for text values — used to inject the field picker. */
  renderTextInput?: (props: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
  }) => React.ReactNode;
  depth?: number;
  className?: string;
}

const MAX_DEPTH = 5;

export function ValueEditor({
  value,
  onChange,
  label,
  placeholder,
  allowKindChange = false,
  kind,
  renderTextInput,
  depth = 0,
  className,
}: ValueEditorProps) {
  const activeKind = kind ?? kindOf(value);

  const kindSwitcher = allowKindChange && !kind && (
    <Select
      value={activeKind}
      onValueChange={(next) => onChange(coerceTo(value, next as ValueKind))}
    >
      <SelectTrigger className="h-8 w-[150px] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KIND_LABELS.map((k) => (
          <SelectItem key={k.value} value={k.value}>
            {k.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  let control: React.ReactNode;

  if (activeKind === "group") {
    control = (
      <GroupEditor
        value={(value ?? {}) as Record<string, unknown>}
        onChange={onChange}
        renderTextInput={renderTextInput}
        depth={depth}
      />
    );
  } else if (activeKind === "list") {
    control = (
      <ListEditor
        value={(value ?? []) as unknown[]}
        onChange={onChange}
        renderTextInput={renderTextInput}
        depth={depth}
      />
    );
  } else if (activeKind === "boolean") {
    control = (
      <div className="flex items-center gap-2 h-8">
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
        />
        <span className="text-xs text-muted-foreground">
          {value ? "Yes" : "No"}
        </span>
      </div>
    );
  } else if (activeKind === "number") {
    control = (
      <Input
        type="number"
        className="h-8"
        value={value === null || value === undefined ? "" : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
      />
    );
  } else {
    const textValue =
      value === null || value === undefined ? "" : String(value);
    control = renderTextInput ? (
      renderTextInput({
        value: textValue,
        onChange: (next) => onChange(next),
        placeholder,
      })
    ) : (
      <Input
        className="h-8"
        value={textValue}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const isNested = activeKind === "group" || activeKind === "list";

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || kindSwitcher) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <span className="text-sm font-medium">{label}</span>
          )}
          {kindSwitcher}
        </div>
      )}
      {isNested ? control : <div>{control}</div>}
    </div>
  );
}

interface GroupEditorProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  renderTextInput?: ValueEditorProps["renderTextInput"];
  depth: number;
}

function GroupEditor({
  value,
  onChange,
  renderTextInput,
  depth,
}: GroupEditorProps) {
  // Key order comes straight from the object. Renaming rebuilds it in the same
  // sequence below, and JS preserves string-key insertion order, so a rename
  // keeps its position without any local tracking to keep in sync.
  const entries = Object.keys(value);

  const setKey = (oldKey: string, newKey: string) => {
    if (newKey === oldKey) return;
    if (newKey !== "" && Object.prototype.hasOwnProperty.call(value, newKey)) {
      return; // refuse duplicates rather than silently overwriting
    }

    // Rebuilding in `entries` order is what keeps the renamed key in place.
    const next: Record<string, unknown> = {};
    for (const k of entries) {
      next[k === oldKey ? newKey : k] = value[k];
    }
    onChange(next);
  };

  const setValue = (key: string, nextValue: unknown) => {
    onChange({ ...value, [key]: nextValue });
  };

  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  const add = () => {
    onChange({ ...value, [uniqueKey(entries)]: "" });
  };

  if (depth >= MAX_DEPTH) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        This is nested too deeply to edit here.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "space-y-2",
        depth > 0 && "pl-3 border-l border-dashed"
      )}
    >
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
          Nothing here yet
        </p>
      )}

      {entries.map((key) => {
        const entryKind = kindOf(value[key]);
        const nested = entryKind === "group" || entryKind === "list";

        return (
          <div
            key={key}
            className={cn(
              "flex gap-2",
              nested ? "flex-col" : "items-start"
            )}
          >
            <div className="flex gap-2 items-center">
              <Input
                className="h-8 w-[160px]"
                value={key}
                placeholder="Name"
                onChange={(e) => setKey(key, e.target.value)}
              />
              <Select
                value={entryKind}
                onValueChange={(next) =>
                  setValue(key, coerceTo(value[key], next as ValueKind))
                }
              >
                <SelectTrigger className="h-8 w-[140px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_LABELS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nested && (
                <>
                  <span className="text-xs text-muted-foreground flex-1">
                    {humanizeFieldName(key)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => remove(key)}
                    aria-label={`Remove ${key}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>

            <div className={cn(nested ? "pl-2" : "flex-1")}>
              <ValueEditor
                value={value[key]}
                onChange={(next) => setValue(key, next)}
                renderTextInput={renderTextInput}
                depth={depth + 1}
              />
            </div>

            {!nested && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => remove(key)}
                aria-label={`Remove ${key}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}

      <Button size="sm" variant="outline" onClick={add} className="gap-1">
        <Plus className="h-3 w-3" />
        Add field
      </Button>
    </div>
  );
}

interface ListEditorProps {
  value: unknown[];
  onChange: (value: unknown) => void;
  renderTextInput?: ValueEditorProps["renderTextInput"];
  depth: number;
}

function ListEditor({
  value,
  onChange,
  renderTextInput,
  depth,
}: ListEditorProps) {
  const setItem = (index: number, next: unknown) => {
    onChange(value.map((item, i) => (i === index ? next : item)));
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const add = () => {
    // New items match the shape of existing ones so lists stay homogeneous.
    const template = value.length > 0 ? kindOf(value[0]) : "text";
    onChange([...value, emptyValueFor(template)]);
  };

  if (depth >= MAX_DEPTH) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        This is nested too deeply to edit here.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", depth > 0 && "pl-3 border-l border-dashed")}>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center border rounded border-dashed">
          No items yet
        </p>
      )}

      {value.map((item, index) => (
        <div key={index} className="flex gap-2 items-start">
          <span className="text-xs text-muted-foreground w-5 pt-2 shrink-0 tabular-nums">
            {index + 1}.
          </span>
          <div className="flex-1">
            <ValueEditor
              value={item}
              onChange={(next) => setItem(index, next)}
              renderTextInput={renderTextInput}
              depth={depth + 1}
            />
          </div>
          <div className="flex flex-col shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-8"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-8"
              onClick={() => move(index, 1)}
              disabled={index === value.length - 1}
              aria-label="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => remove(index)}
            aria-label={`Remove item ${index + 1}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <Button size="sm" variant="outline" onClick={add} className="gap-1">
        <Plus className="h-3 w-3" />
        Add item
      </Button>
    </div>
  );
}
