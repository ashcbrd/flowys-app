import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { connectToDatabase, Execution, Workflow } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { ResultView } from "@/components/shared/ResultView";

/**
 * One step's output, full page.
 *
 * The same address scheme as the run result it belongs to: the run at
 * /results/[id], each of its steps one segment deeper. Step output is working
 * data rather than a deliverable, so this page stays plainer than the run's:
 * no prose treatment, just the step's facts and everything it produced,
 * rendered readably.
 */

type PageParams = { params: Promise<{ id: string; nodeId: string }> };

export default async function StepResultPage({ params }: PageParams) {
  const user = await getAuthenticatedUser();
  if (!user?.id) redirect("/login");

  const { id, nodeId } = await params;

  await connectToDatabase();
  const execution = await Execution.findById(id).lean();
  if (!execution) notFound();

  const workflow = await Workflow.findById(String(execution.workflowId))
    .select({ name: 1, userId: 1 })
    .lean();
  if (!workflow || workflow.userId !== user.id) notFound();

  const log = (execution.logs ?? []).find((entry) => entry.nodeId === nodeId);
  if (!log) notFound();

  const failed = log.status === "failed";

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 border-b border-[var(--fy-line)] bg-white/70 backdrop-blur-xl print:hidden dark:bg-[#0b1120]/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
          <Link
            href={`/results/${String(execution._id)}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--fy-ink)] transition-colors hover:text-[var(--fy-blue)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to the run result
          </Link>
          <Link
            href={`/workflow/${String(execution.workflowId)}`}
            className="text-[13px] font-semibold text-[var(--fy-slate)] transition-colors hover:text-[var(--fy-blue)]"
          >
            Open the canvas
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
        <header className="mb-8 px-1">
          <p className="fy-eyebrow text-[var(--fy-blue)]">Step result</p>
          <h1 className="fy-display mt-2 text-3xl text-[var(--fy-ink)] sm:text-4xl">
            {log.nodeName}
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
            {typeof log.duration === "number" && log.duration > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{log.duration}ms</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>a step of {workflow.name}</span>
          </p>
        </header>

        <section className="border-t border-[var(--fy-line)] px-1 pt-10">
          {log.error ? (
            <p className="rounded-xl bg-red-500/8 px-4 py-3 text-[14px] leading-relaxed text-red-700 dark:text-red-400">
              {log.error}
            </p>
          ) : log.output ? (
            <ResultView value={log.output} copyable={false} />
          ) : (
            <p className="text-[14px] italic text-[var(--fy-slate)]">
              This step produced nothing to show.
            </p>
          )}
        </section>

        <footer className="mt-12 flex items-center justify-between px-1 text-[12px] text-[var(--fy-slate)]">
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
