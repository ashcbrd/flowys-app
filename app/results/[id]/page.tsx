import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { connectToDatabase, Execution, Workflow } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { Prose } from "@/components/shared/Prose";
import { ResultView } from "@/components/shared/ResultView";
import { ResultActions } from "./ResultActions";

/**
 * A run's result as its own page.
 *
 * The result used to live in a modal over the canvas, which framed a finished
 * brand board or ad pack as a debug artifact: scrollable, dismissable,
 * trapped behind the builder's own UI. The deliverable earns a page. It gets
 * an address a person can reopen and print, and it reads like a document
 * because it is one: the sheet carries only the result, the header carries
 * only the facts of the run, and the step trace folds away underneath for
 * whoever wants to know how it was made.
 */

type PageParams = { params: Promise<{ id: string }> };

/**
 * Same test Prose.tsx uses, restated here because that module is client-side
 * and a client function cannot be called during server rendering.
 */
function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /^\s*\d+\.\s/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /^>\s/m.test(text) ||
    /`[^`\n]+`/.test(text) ||
    /^\s*\|.+\|/m.test(text) ||
    /!?\[[^\]]*\]\([^)]+\)/.test(text)
  );
}

/** The output step hands back { result, format }; anything else is raw data. */
function asProse(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const record = output as Record<string, unknown>;
  const keys = Object.keys(record);
  const isProseShape =
    typeof record.result === "string" &&
    keys.every((k) => k === "result" || k === "format" || k === "message");
  return isProseShape ? (record.result as string) : null;
}

function formatWhen(value: string | Date | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(
  start?: string | Date,
  end?: string | Date
): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 90) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default async function ResultPage({ params }: PageParams) {
  const user = await getAuthenticatedUser();
  if (!user?.id) redirect("/login");

  const { id } = await params;

  await connectToDatabase();
  const execution = await Execution.findById(id).lean();
  if (!execution) notFound();

  const workflow = await Workflow.findById(String(execution.workflowId))
    .select({ name: 1, userId: 1 })
    .lean();
  if (!workflow || workflow.userId !== user.id) notFound();

  const prose = asProse(execution.output);
  const failed = execution.status === "failed";
  const when = formatWhen(execution.completedAt ?? execution.createdAt);
  const duration = formatDuration(execution.startedAt, execution.completedAt);
  const steps = execution.logs ?? [];

  return (
    <div className="min-h-screen bg-[var(--fy-mist)] print:bg-white">
      {/* Top bar: navigation and actions, never part of the document. */}
      <nav className="sticky top-0 z-40 border-b border-[var(--fy-line)] bg-white/70 backdrop-blur-xl print:hidden dark:bg-[#0b1120]/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
          <Link
            href={`/workflow/${String(execution.workflowId)}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--fy-ink)] transition-colors hover:text-[var(--fy-blue)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to the canvas
          </Link>
          <ResultActions
            text={prose ?? JSON.stringify(execution.output ?? {}, null, 2)}
          />
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
        {/* The facts of the run, set above the sheet like a colophon. */}
        <header className="mb-8 px-1">
          <p className="fy-eyebrow text-[var(--fy-blue)]">Run result</p>
          <h1 className="fy-display mt-2 text-3xl text-[var(--fy-ink)] sm:text-4xl">
            {workflow.name}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--fy-slate)]">
            <span
              className={
                failed
                  ? "inline-flex items-center gap-1.5 font-semibold text-red-600"
                  : "inline-flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-500"
              }
            >
              <span
                className={
                  failed
                    ? "h-1.5 w-1.5 rounded-full bg-red-500"
                    : "h-1.5 w-1.5 rounded-full bg-green-500"
                }
              />
              {failed ? "Did not finish" : "Completed"}
            </span>
            {when && (
              <>
                <span aria-hidden>·</span>
                <span>{when}</span>
              </>
            )}
            {duration && (
              <>
                <span aria-hidden>·</span>
                <span>{duration}</span>
              </>
            )}
            {steps.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {steps.length} step{steps.length === 1 ? "" : "s"}
                </span>
              </>
            )}
          </p>
        </header>

        {/* The sheet. Only the result lives on it. */}
        <article className="rounded-2xl border border-[var(--fy-line)] bg-background px-6 py-8 shadow-[0_18px_44px_-28px_rgba(11,17,32,0.35)] print:border-0 print:px-0 print:shadow-none sm:px-10 sm:py-12">
          {failed ? (
            <div className="space-y-4">
              <p className="text-[15px] leading-relaxed text-[var(--fy-ink)]">
                This run stopped before it could finish
                {execution.error ? ":" : "."}
              </p>
              {execution.error && (
                <p className="rounded-xl bg-red-500/8 px-4 py-3 text-[14px] leading-relaxed text-red-700 dark:text-red-400">
                  {execution.error}
                </p>
              )}
            </div>
          ) : prose !== null ? (
            looksLikeMarkdown(prose) ? (
              <Prose className="text-[15px]">{prose}</Prose>
            ) : (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--fy-ink)]">
                {prose}
              </p>
            )
          ) : (
            <ResultView value={execution.output} copyable={false} />
          )}
        </article>

        {/* The trace, folded away. Provenance for whoever wants it. */}
        {steps.length > 0 && (
          <section className="mt-10 print:hidden">
            <h2 className="fy-eyebrow px-1 text-[var(--fy-slate)]">
              How it was made
            </h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--fy-line)] bg-background">
              {steps.map((log, i) => (
                <details
                  key={`${log.nodeId}-${i}`}
                  className="group border-b border-[var(--fy-line)] last:border-b-0"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--fy-mist)] [&::-webkit-details-marker]:hidden">
                    <span
                      className={
                        log.status === "completed"
                          ? "h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                          : log.status === "failed"
                            ? "h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                            : "h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fy-line)]"
                      }
                    />
                    <span className="flex-1 truncate text-[14px] font-medium text-[var(--fy-ink)]">
                      {log.nodeName}
                    </span>
                    {typeof log.duration === "number" && log.duration > 0 && (
                      <span className="fy-mono shrink-0 text-[12px] text-[var(--fy-slate)]">
                        {log.duration}ms
                      </span>
                    )}
                  </summary>
                  <div className="border-t border-[var(--fy-line)] bg-[var(--fy-mist)]/60 px-5 py-4">
                    {log.error ? (
                      <p className="text-[13px] leading-relaxed text-red-600 dark:text-red-400">
                        {log.error}
                      </p>
                    ) : log.output ? (
                      <ResultView value={log.output} copyable={false} />
                    ) : (
                      <p className="text-[13px] italic text-[var(--fy-slate)]">
                        This step produced nothing to show.
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-12 flex items-center justify-between px-1 text-[12px] text-[var(--fy-slate)] print:hidden">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-[var(--fy-blue)] to-[var(--fy-blue-deep)]">
              <Zap className="h-2.5 w-2.5 text-white" />
            </span>
            Made with Flowys
          </span>
          <span className="fy-mono">run {String(execution._id).slice(0, 8)}</span>
        </footer>
      </main>
    </div>
  );
}
