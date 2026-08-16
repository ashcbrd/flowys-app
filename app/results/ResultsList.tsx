"use client";

import * as React from "react";
import Link from "next/link";
import {
  Palette,
  Mail,
  Image as ImageIcon,
  FileText,
  Braces,
  CircleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RESULT_CATEGORIES,
  type ResultCategory,
} from "@/lib/results/categorize";

/**
 * The filterable list under /results. The rows arrive fully derived from the
 * server; all this owns is which chip is pressed.
 */

export interface ResultRow {
  id: string;
  workflowName: string;
  category: ResultCategory;
  thumb: string | null;
  steps: number;
  createdAt: string;
  durationMs: number | null;
}

const CATEGORY_ICON: Record<ResultCategory, React.ReactNode> = {
  brand: <Palette className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  picture: <ImageIcon className="h-4 w-4" />,
  written: <FileText className="h-4 w-4" />,
  data: <Braces className="h-4 w-4" />,
  failed: <CircleAlert className="h-4 w-4" />,
};

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 90) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function ResultsList({ rows }: { rows: ResultRow[] }) {
  const [active, setActive] = React.useState<ResultCategory | "all">("all");

  const counts = React.useMemo(() => {
    const map = new Map<ResultCategory, number>();
    for (const row of rows) map.set(row.category, (map.get(row.category) ?? 0) + 1);
    return map;
  }, [rows]);

  const visible = active === "all" ? rows : rows.filter((r) => r.category === active);

  const chip = (id: ResultCategory | "all", label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setActive(id)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
        active === id
          ? "border-[var(--fy-ink)] bg-[var(--fy-ink)] text-white dark:bg-white dark:text-[#0b1120]"
          : "border-[var(--fy-line)] text-[var(--fy-ink)] hover:bg-[var(--fy-mist)]"
      )}
    >
      {label}
      <span
        className={cn(
          "text-[11px] font-medium",
          active === id ? "opacity-70" : "text-[var(--fy-slate)]"
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2 px-1">
        {chip("all", "All", rows.length)}
        {RESULT_CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) > 0).map((c) =>
          chip(c.id, c.label, counts.get(c.id) ?? 0)
        )}
      </div>

      {visible.length === 0 ? (
        <p className="border-t border-[var(--fy-line)] px-1 pt-10 text-[14px] text-[var(--fy-slate)]">
          Nothing here yet. Run a workflow and its result will file itself on
          this page.
        </p>
      ) : (
        <div className="border-t border-[var(--fy-line)]">
          {visible.map((row) => (
            <Link
              key={row.id}
              href={`/results/${row.id}`}
              className="group flex items-center gap-4 border-b border-[var(--fy-line)] px-1 py-4 transition-colors hover:bg-[var(--fy-mist)]"
            >
              {row.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.thumb}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-lg border border-[var(--fy-line)] bg-white object-cover"
                />
              ) : (
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--fy-line)]",
                    row.category === "failed"
                      ? "text-red-500"
                      : "text-[var(--fy-slate)]"
                  )}
                >
                  {CATEGORY_ICON[row.category]}
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[var(--fy-ink)] group-hover:text-[var(--fy-blue)]">
                  {row.workflowName}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-[var(--fy-slate)]">
                  {formatWhen(row.createdAt)}
                  {formatDuration(row.durationMs) && (
                    <> · {formatDuration(row.durationMs)}</>
                  )}
                  {row.steps > 0 && (
                    <>
                      {" "}
                      · {row.steps} step{row.steps === 1 ? "" : "s"}
                    </>
                  )}
                </span>
              </span>

              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                  row.category === "failed"
                    ? "bg-red-500/10 text-red-600"
                    : "bg-[var(--fy-mist)] text-[var(--fy-slate)]"
                )}
              >
                {CATEGORY_ICON[row.category]}
                {RESULT_CATEGORIES.find((c) => c.id === row.category)?.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
