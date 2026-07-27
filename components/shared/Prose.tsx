"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders a step's written output as formatted text.
 *
 * The AI steps are asked for markdown and they answer in markdown, so a result
 * panel that prints the raw string shows people `## Decided` and `**true**`
 * instead of a heading and a bold word. Everything here is a whole document
 * someone is meant to read, so it gets rendered.
 *
 * Styling is set element by element rather than through a typography plugin,
 * because these blocks sit inside cards and drawers where the surrounding type
 * scale is already small and a prose preset would fight it.
 */

/** Markdown is only worth rendering if the text actually uses any. */
export function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /^\s*\d+\.\s/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /^>\s/m.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /^\s*\|.+\|/m.test(text)
  );
}

interface ProseProps {
  children: string;
  className?: string;
}

export function Prose({ children, className }: ProseProps) {
  return (
    <div className={cn("text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="fy-display text-lg mt-4 mb-2 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="fy-display text-base mt-4 mb-1.5 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-semibold text-sm mt-3 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="font-semibold text-sm mt-3 mb-1 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-2 space-y-1 pl-4 list-disc marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1 pl-4 list-decimal marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[var(--fy-blue)]/40 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className: c, children }) => {
            // A fenced block arrives with a language class; inline code has none.
            const isBlock = typeof c === "string" && c.includes("language-");
            if (isBlock) {
              return (
                <code className="fy-mono block overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                  {children}
                </code>
              );
            }
            return (
              <code className="fy-mono rounded bg-muted px-1 py-0.5 text-[0.85em]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--fy-blue)] underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 fy-hairline border-0" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b px-2 py-1.5 text-left font-medium text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-2 py-1.5 align-top">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
