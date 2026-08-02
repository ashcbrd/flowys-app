"use client";

import * as React from "react";
import { Check, Copy, Printer } from "lucide-react";

/**
 * The two things a person does with a finished result: take it somewhere
 * else, or put it on paper. Both live up in the top bar so the document
 * itself stays a document.
 */
export function ResultActions({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const button =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--fy-line)] px-3.5 text-[13px] font-semibold text-[var(--fy-ink)] transition-colors hover:bg-[var(--fy-mist)]";

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={copy} className={button}>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" onClick={() => window.print()} className={button}>
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>
    </div>
  );
}
