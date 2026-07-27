"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { humanizeFieldName } from "@/lib/vocabulary";
import { ValueEditor } from "./ValueEditor";
import { FileField } from "./FileField";
import type { InputField } from "@/lib/nodes/types";

/**
 * The form someone fills in to run a workflow.
 *
 * Generated from the fields the workflow's Input node already declares, so the
 * person running it never writes JSON. Values are passed straight to
 * `executeWorkflow`; the Input node handler does the type coercion it always did.
 */

export type RunValues = Record<string, unknown>;

/**
 * Pull the declared input fields out of a workflow graph.
 *
 * Deliberately structural rather than tied to one node type: the canvas store
 * and the saved-workflow API describe nodes with different interfaces that share
 * this shape.
 */
export function inputFieldsOf(
  nodes: { type: string; data: { config?: Record<string, unknown> } }[] | undefined
): InputField[] {
  const inputNode = (nodes || []).find((n) => n.type === "input");
  if (!inputNode) return [];

  const fields = inputNode.data?.config?.fields as InputField[] | undefined;
  return (fields || []).filter((f) => f?.name);
}

/** Starting values for a form: saved defaults, else an empty value per type. */
export function initialRunValues(fields: InputField[]): RunValues {
  const values: RunValues = {};

  for (const field of fields) {
    if (field.default !== undefined) {
      values[field.name] = field.default;
      continue;
    }

    switch (field.type) {
      case "number":
        values[field.name] = "";
        break;
      case "boolean":
        values[field.name] = false;
        break;
      case "json":
        values[field.name] = {};
        break;
      case "file":
        values[field.name] = "";
        break;
      default:
        values[field.name] = "";
    }
  }

  return values;
}

/** Which required fields are still blank. Keyed by field name. */
export function validateRunValues(
  fields: InputField[],
  values: RunValues
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (!field.required) continue;

    const value = values[field.name];
    const blank =
      value === undefined ||
      value === null ||
      value === "" ||
      (typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value as object).length === 0) ||
      (Array.isArray(value) && value.length === 0);

    if (blank) {
      errors[field.name] = `${fieldLabel(field)} is needed to run this.`;
    }
  }

  return errors;
}

function fieldLabel(field: InputField): string {
  return field.label?.trim() || humanizeFieldName(field.name);
}

interface RunFormProps {
  fields: InputField[];
  values: RunValues;
  onChange: (values: RunValues) => void;
  errors?: Record<string, string>;
  className?: string;
}

export function RunForm({
  fields,
  values,
  onChange,
  errors = {},
  className,
}: RunFormProps) {
  const set = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  if (fields.length === 0) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {fields.map((field) => {
        const label = fieldLabel(field);
        const error = errors[field.name];
        const value = values[field.name];
        const id = `run-field-${field.name}`;

        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id}>
              {label}
              {field.required && (
                <span className="text-destructive ml-1" aria-hidden>
                  *
                </span>
              )}
            </Label>

            {field.description && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}

            {field.type === "boolean" && (
              <div className="flex items-center gap-2 h-9">
                <Switch
                  id={id}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => set(field.name, checked)}
                />
                <span className="text-sm text-muted-foreground">
                  {value ? "Yes" : "No"}
                </span>
              </div>
            )}

            {field.type === "number" && (
              <Input
                id={id}
                type="number"
                value={value === undefined || value === null ? "" : String(value)}
                placeholder={field.placeholder}
                onChange={(e) =>
                  set(
                    field.name,
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                aria-invalid={Boolean(error)}
              />
            )}

            {field.type === "json" && (
              <div className="rounded-md border p-3">
                <ValueEditor
                  value={value ?? {}}
                  onChange={(next) => set(field.name, next)}
                  kind="group"
                />
              </div>
            )}

            {field.type === "file" && (
              <FileField
                id={id}
                value={value === undefined || value === null ? "" : String(value)}
                onChange={(text) => set(field.name, text)}
              />
            )}

            {(field.type === "string" || !field.type) &&
              (() => {
                const text =
                  value === undefined || value === null ? "" : String(value);

                // Honour the declared intent, but also switch as soon as the
                // content itself is clearly more than a line, otherwise pasting
                // an email into a field nobody marked leaves it unreadable.
                const long =
                  field.multiline || text.includes("\n") || text.length > 120;

                return long ? (
                  <Textarea
                    id={id}
                    value={text}
                    placeholder={field.placeholder}
                    onChange={(e) => set(field.name, e.target.value)}
                    aria-invalid={Boolean(error)}
                    rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
                    className="resize-y"
                  />
                ) : (
                  <Input
                    id={id}
                    value={text}
                    placeholder={field.placeholder}
                    onChange={(e) => set(field.name, e.target.value)}
                    aria-invalid={Boolean(error)}
                  />
                );
              })()}

            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
