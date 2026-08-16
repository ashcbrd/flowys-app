import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { connectToDatabase, Execution, Workflow } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { categorizeRun, firstImageUrl } from "@/lib/results/categorize";
import { ResultsList, type ResultRow } from "./ResultsList";

/**
 * Every result the account has produced, one page, filterable by what kind
 * of thing each run made. The category is derived from the run's own outputs
 * (see lib/results/categorize.ts), so nothing here needs tagging to file
 * itself correctly.
 *
 * Same address family as the pages it links to: this is /results, each run
 * is /results/[id], each step /results/[id]/step/[nodeId].
 */

export default async function ResultsIndexPage() {
  const user = await getAuthenticatedUser();
  if (!user?.id) redirect("/login");

  await connectToDatabase();

  const workflows = await Workflow.find({ userId: user.id })
    .select({ _id: 1, name: 1 })
    .lean();
  const names = new Map(workflows.map((w) => [String(w._id), w.name]));

  const executions = await Execution.find({
    workflowId: { $in: [...names.keys()] },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .select({
      workflowId: 1,
      status: 1,
      createdAt: 1,
      startedAt: 1,
      completedAt: 1,
      "output.format": 1,
      "logs.output": 1,
    })
    .lean();

  const rows: ResultRow[] = executions.map((execution) => {
    const logOutputs = (execution.logs ?? []).map((log) => log.output);
    return {
      id: String(execution._id),
      workflowName: names.get(String(execution.workflowId)) ?? "Untitled Workflow",
      category: categorizeRun({
        status: execution.status,
        format: (execution.output as { format?: string } | undefined)?.format,
        logOutputs,
      }),
      thumb: firstImageUrl(logOutputs),
      steps: (execution.logs ?? []).length,
      createdAt: new Date(execution.createdAt).toISOString(),
      durationMs:
        execution.startedAt && execution.completedAt
          ? Math.max(
              0,
              new Date(execution.completedAt).getTime() -
                new Date(execution.startedAt).getTime()
            )
          : null,
    };
  });

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-40 border-b border-[var(--fy-line)] bg-white/70 backdrop-blur-xl dark:bg-[#0b1120]/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
          <Link
            href="/workflow"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--fy-ink)] transition-colors hover:text-[var(--fy-blue)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to the canvas
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
        <header className="mb-8 px-1">
          <p className="fy-eyebrow text-[var(--fy-blue)]">Everything you made</p>
          <h1 className="fy-display mt-2 text-3xl text-[var(--fy-ink)] sm:text-4xl">
            Results
          </h1>
        </header>

        <ResultsList rows={rows} />

        <footer className="mt-12 flex items-center justify-between px-1 text-[12px] text-[var(--fy-slate)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-[var(--fy-blue)] to-[var(--fy-blue-deep)]">
              <Zap className="h-2.5 w-2.5 text-white" />
            </span>
            Made with Flowys
          </span>
          {rows.length === 200 && <span>Showing the latest 200 runs</span>}
        </footer>
      </main>
    </div>
  );
}
