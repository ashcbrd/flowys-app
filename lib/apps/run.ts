import { v4 as uuid } from "uuid";
import { connectToDatabase } from "@/lib/db";
import type { NodeData, EdgeData } from "@/lib/db";
import { AppRun } from "@/lib/db/models/AppRun";
import { getAppForUser, getCurrentSnapshot } from "./service";
import { createExecutor } from "@/lib/engine";
import { calculateWorkflowCost, deductCredits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/db/models/RateLimit";

export type AppRunErrorCode = "not_found" | "not_published" | "rate_limited" | "cost_exceeded";

export class AppRunError extends Error {
  code: AppRunErrorCode;
  constructor(message: string, code: AppRunErrorCode) {
    super(message);
    this.name = "AppRunError";
    this.code = code;
  }
}

export interface RunAppResult {
  appRunId: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  cost: number;
}

/**
 * Run a published app for a permitted member: gate access, enforce the app's
 * rate limit and per-run cost cap, execute the frozen snapshot, and record an
 * AppRun. Errors a person may see are plain-language AppRunErrors.
 */
export async function runApp(params: {
  appListingId: string;
  runByUserId: string;
  input: Record<string, unknown>;
}): Promise<RunAppResult> {
  const { appListingId, runByUserId, input } = params;
  await connectToDatabase();

  const listing = await getAppForUser(appListingId, runByUserId);
  if (!listing) throw new AppRunError("This app isn't available to you.", "not_found");

  const snapshot = await getCurrentSnapshot(appListingId);
  if (!snapshot) throw new AppRunError("This app hasn't been published yet.", "not_published");

  const nodes = snapshot.nodes as NodeData[];
  const edges = snapshot.edges as EdgeData[];

  const perHour = listing.settings?.rateLimitPerHour;
  if (perHour && perHour > 0) {
    const rl = await checkRateLimit({
      key: `apprun:${appListingId}:${runByUserId}`,
      limit: perHour,
      windowSeconds: 3600,
    });
    if (!rl.allowed) {
      throw new AppRunError(
        "You've run this app too many times in the last hour. Please try again shortly.",
        "rate_limited"
      );
    }
  }

  const cost = calculateWorkflowCost(nodes);
  const cap = listing.settings?.costCapPerRun;
  if (typeof cap === "number" && cost > cap) {
    throw new AppRunError("This run is too large to allow. Please contact the app's owner.", "cost_exceeded");
  }

  const appRunId = uuid();
  const startedAt = new Date();
  await AppRun.create({
    _id: appRunId,
    appListingId,
    appVersionId: listing.currentVersionId,
    workspaceId: listing.workspaceId,
    runByUserId,
    input,
    status: "running",
    startedAt,
  });

  try {
    const result = await createExecutor(nodes, edges).execute(input);
    await deductCredits(runByUserId, cost);

    await AppRun.updateOne(
      { _id: appRunId },
      {
        $set: {
          status: result.success ? "completed" : "failed",
          output: result.output,
          logs: result.logs,
          error: result.error,
          cost,
          durationMs: result.duration,
          completedAt: new Date(),
        },
      }
    );

    return { appRunId, success: result.success, output: result.output, error: result.error, cost };
  } catch (err) {
    // Best-effort finalize so the run is never stuck "running".
    await AppRun.updateOne(
      { _id: appRunId },
      {
        $set: {
          status: "failed",
          error: "The run could not be completed.",
          cost,
          completedAt: new Date(),
        },
      }
    ).catch(() => {});
    throw err;
  }
}
