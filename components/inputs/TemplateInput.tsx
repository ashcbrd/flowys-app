"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FieldPicker } from "./FieldPicker";
import { TokenEditor, type TokenEditorHandle } from "./TokenEditor";
import type { AvailableField } from "@/lib/utils/fields";

/**
 * Text input that can contain references to values from earlier steps.
 *
 * The stored string keeps the engine's `{{token}}` grammar untouched, but the
 * person never sees a brace: references render as labelled chips inside the
 * field itself, the picker inserts them at the caret, and anything typed or
 * pasted as a raw token becomes a chip on blur. This used to be a plain box
 * with a chip preview underneath, which meant the one thing being edited was
 * the one thing still shown in developer grammar.
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
  const editor = React.useRef<TokenEditorHandle>(null);

  return (
    <div className={cn("space-y-2", className)}>
      <TokenEditor
        ref={editor}
        value={value}
        onChange={onChange}
        fields={fields}
        placeholder={placeholder}
        multiline={multiline}
        rows={rows}
      />
      <FieldPicker fields={fields} onSelect={(path) => editor.current?.insertToken(path)} />
    </div>
  );
}
