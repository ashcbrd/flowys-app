"use client";

import * as React from "react";
import { Variable, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AvailableField } from "@/lib/utils/fields";

/**
 * "Use a value from an earlier step".
 *
 * The user picks a field by its readable name; the caller receives the raw path
 * and stores it as a `{{token}}`. Braces are never typed or read by the user.
 */

interface FieldPickerProps {
  fields: AvailableField[];
  onSelect: (path: string) => void;
  label?: string;
}

export function FieldPicker({
  fields,
  onSelect,
  label = "Use a value from an earlier step",
}: FieldPickerProps) {
  // Group by originating node so the list reads as a history of the workflow.
  const grouped = React.useMemo(() => {
    const map = new Map<string, AvailableField[]>();
    for (const field of fields) {
      const list = map.get(field.source) || [];
      list.push(field);
      map.set(field.source, list);
    }
    return [...map.entries()];
  }, [fields]);

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Connect this to an earlier step to reuse its values here.
      </p>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
          <Variable className="h-3 w-3" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-[260px]">
        {grouped.map(([source, sourceFields]) => (
          <div key={source}>
            <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {source}
            </p>
            {sourceFields.map((field) => (
              <DropdownMenuItem
                key={field.path}
                onClick={() => onSelect(field.path)}
              >
                <span className="flex-1">{field.label}</span>
                {field.fromExecution && (
                  <Sparkles
                    className="h-3 w-3 text-muted-foreground"
                    aria-label="Seen in the last run"
                  />
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
