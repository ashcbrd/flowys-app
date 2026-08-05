"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { parseTemplate } from "@/lib/utils/template";
import { humanizeFieldName } from "@/lib/vocabulary";
import type { AvailableField } from "@/lib/utils/fields";

/**
 * The editing surface where template values are chips, not braces.
 *
 * The stored string keeps the engine's `{{token}}` grammar untouched; what
 * the person sees and edits is text with labelled pills in it. This is the
 * last place the product showed a bracket to a user: the preview under the
 * old field rendered chips, but the box itself still asked people to look at
 * `{{imageMarkdown}}` while they typed around it.
 *
 * Built on contentEditable, with the usual discipline that makes that safe:
 * React never manages the children (the DOM is rendered imperatively and
 * re-rendered only when the value changes from outside), Enter and paste are
 * intercepted so the DOM only ever contains text, <br> and chip spans, and
 * serialisation walks exactly those three shapes. Chips are
 * contentEditable=false, so the caret treats each one as a single character:
 * backspace removes the whole chip, never half a token.
 */

export interface TokenEditorHandle {
  insertToken: (path: string) => void;
}

interface TokenEditorProps {
  value: string;
  onChange: (value: string) => void;
  fields: AvailableField[];
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
}

const CHIP_KNOWN =
  "mx-0.5 inline-block max-w-full truncate rounded bg-primary/10 px-1.5 py-0.5 align-baseline text-[0.92em] font-medium text-primary select-none";
const CHIP_UNKNOWN =
  "mx-0.5 inline-block max-w-full truncate rounded bg-destructive/10 px-1.5 py-0.5 align-baseline text-[0.92em] font-medium text-destructive select-none";

function chipLabel(path: string): string {
  return humanizeFieldName(path.split(".").pop() || path);
}

function makeChip(path: string, known: boolean): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.token = path;
  chip.className = known ? CHIP_KNOWN : CHIP_UNKNOWN;
  chip.textContent = chipLabel(path);
  chip.title = known ? path : `No earlier step provides "${path}"`;
  return chip;
}

/** DOM -> template string. Only text, <br> and chips exist in the editor. */
function serialize(root: HTMLElement): string {
  let out = "";

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    if (el.dataset.token !== undefined) {
      out += `{{${el.dataset.token}}}`;
      return;
    }
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    // A block element a browser slipped past the Enter handler (a pasted
    // div, say) reads as a line of its own.
    const block = el.tagName === "DIV" || el.tagName === "P";
    if (block && out !== "" && !out.endsWith("\n")) out += "\n";
    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);

  // contentEditable keeps a dangling <br> so the last line stays visible,
  // and pressing Enter at the end produces a second one for the same reason.
  // That trailing break is presentation, not a newline somebody typed.
  return out.replace(/\n$/, "");
}

/** Template string -> DOM. */
function render(root: HTMLElement, value: string, known: (path: string) => boolean) {
  root.replaceChildren();

  for (const segment of parseTemplate(value || "")) {
    if (segment.kind === "variable") {
      root.appendChild(makeChip(segment.path, known(segment.path)));
      continue;
    }
    const lines = segment.value.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) root.appendChild(document.createElement("br"));
      if (line) root.appendChild(document.createTextNode(line));
    });
  }
}

export const TokenEditor = React.forwardRef<TokenEditorHandle, TokenEditorProps>(
  function TokenEditor(
    { value, onChange, fields, placeholder, multiline = false, rows = 4, className },
    ref
  ) {
    const editorRef = React.useRef<HTMLDivElement | null>(null);
    // What this editor last told the outside world. While the person types,
    // the value prop echoes back through the store; re-rendering the DOM on
    // that echo would throw the caret to the start on every keystroke.
    const lastEmitted = React.useRef<string | null>(null);

    const known = React.useCallback(
      (path: string) => fields.some((f) => f.path === path),
      [fields]
    );

    React.useLayoutEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      if (value === lastEmitted.current) return;
      render(el, value, known);
      el.dataset.empty = value ? "false" : "true";
      lastEmitted.current = value;
    }, [value, known]);

    const emit = () => {
      const el = editorRef.current;
      if (!el) return;
      const next = serialize(el);
      el.dataset.empty = next ? "false" : "true";
      lastEmitted.current = next;
      onChange(next);
    };

    const caretIntoEditor = (): Range | null => {
      const el = editorRef.current;
      if (!el) return null;
      const selection = window.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        el.contains(selection.getRangeAt(0).commonAncestorContainer)
      ) {
        return selection.getRangeAt(0);
      }
      // Nothing selected inside the editor: append at the end.
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      return range;
    };

    React.useImperativeHandle(ref, () => ({
      insertToken: (path: string) => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();

        const range = caretIntoEditor();
        if (!range) return;

        range.deleteContents();
        const chip = makeChip(path, known(path));
        range.insertNode(chip);

        // Caret after the chip, so typing continues past it.
        const selection = window.getSelection();
        if (selection) {
          const after = document.createRange();
          after.setStartAfter(chip);
          after.collapse(true);
          selection.removeAllRanges();
          selection.addRange(after);
        }

        emit();
      },
    }));

    return (
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline={multiline}
        aria-placeholder={placeholder}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-empty="true"
        data-placeholder={placeholder ?? ""}
        style={multiline ? { minHeight: `${rows * 1.4 + 1.1}em` } : undefined}
        className={cn(
          "w-full cursor-text whitespace-pre-wrap break-words rounded-md border border-input bg-background px-3 py-2 text-sm leading-6",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-muted-foreground data-[empty=true]:before:content-[attr(data-placeholder)]",
          !multiline && "min-h-8 py-1.5",
          className
        )}
        onInput={emit}
        onBlur={() => {
          // Hand-typed or pasted {{tokens}} become chips the moment the
          // field is left, so the normalised look is never more than a blur
          // away and the caret is never fought over while typing.
          const el = editorRef.current;
          if (!el) return;
          const current = serialize(el);
          render(el, current, known);
          el.dataset.empty = current ? "false" : "true";
          lastEmitted.current = current;
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (!multiline) return;
          // insertLineBreak keeps the DOM to text + <br>, which is what the
          // serialiser expects, and it preserves the browser's undo stack.
          // Deprecated on paper, universal in practice.
          document.execCommand("insertLineBreak");
          emit();
        }}
        onPaste={(e) => {
          // Paste as plain text: a rich clipboard would smuggle markup into
          // a DOM the serialiser deliberately keeps to three shapes.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          emit();
        }}
      />
    );
  }
);
