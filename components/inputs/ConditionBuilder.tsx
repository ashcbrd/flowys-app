"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONDITION_OPERATORS,
  buildCondition,
  parseCondition,
} from "@/lib/vocabulary";
import type { AvailableField } from "@/lib/utils/fields";

/**
 * Builds a rule from three dropdowns instead of asking the user to type an
 * expression like `item.score > 80`.
 *
 * The output is the same condition string the Logic node already parses, so
 * existing saved conditions keep working and can be edited here.
 */

interface ConditionBuilderProps {
  value: string | undefined;
  onChange: (condition: string) => void;
  fields: AvailableField[];
  label?: string;
  help?: string;
}

export function ConditionBuilder({
  value,
  onChange,
  fields,
  label = "Rule",
  help,
}: ConditionBuilderProps) {
  const parsed = parseCondition(value);

  // A saved condition may reference a field the picker doesn't know about; keep
  // it selectable so editing the operator doesn't silently discard it.
  const options = React.useMemo(() => {
    const known = fields.map((f) => ({ path: f.path, label: f.label }));
    if (parsed.field && !known.some((k) => k.path === parsed.field)) {
      return [{ path: parsed.field, label: parsed.field }, ...known];
    }
    return known;
  }, [fields, parsed.field]);

  const operator =
    CONDITION_OPERATORS.find((o) => o.value === parsed.operator) ??
    CONDITION_OPERATORS[0];

  const emit = (next: {
    field?: string;
    operator?: string;
    value?: string;
  }) => {
    onChange(
      buildCondition(
        next.field ?? parsed.field,
        next.operator ?? parsed.operator,
        next.value ?? parsed.value
      )
    );
  };

  return (
    <div>
      <Label>{label}</Label>
      {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}

      <div className="flex flex-wrap gap-2 mt-2">
        <Select
          value={parsed.field || undefined}
          onValueChange={(field) => emit({ field })}
        >
          <SelectTrigger className="h-8 flex-1 min-w-[140px]">
            <SelectValue placeholder="Choose a value" />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? (
              <SelectItem value="__none" disabled>
                Connect an earlier step first
              </SelectItem>
            ) : (
              options.map((option) => (
                <SelectItem key={option.path} value={option.path}>
                  {option.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Select
          value={parsed.operator}
          onValueChange={(next) => emit({ operator: next })}
        >
          <SelectTrigger className="h-8 w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {operator.needsValue && (
          <Input
            className="h-8 flex-1 min-w-[100px]"
            value={parsed.value}
            placeholder="Compare to…"
            onChange={(e) => emit({ value: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}
