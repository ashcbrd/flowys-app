import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { runApp, AppRunError, type AppRunErrorCode } from "@/lib/apps/run";
import { AppRun } from "@/lib/db/models/AppRun";
import type { ExecutionLog } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

const STATUS_BY_CODE: Record<AppRunErrorCode, number> = {
  not_found: 404,
  not_published: 409,
  rate_limited: 429,
  cost_exceeded: 402,
};

/** Run a published app for the caller and hand back its result and step log. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const input = (body?.input as Record<string, unknown>) || {};

    const result = await runApp({
      appListingId: id,
      runByUserId: user.id,
      input,
    });

    let steps: { nodeName: string; status: string }[] = [];
    const run = await AppRun.findById(result.appRunId).lean();
    if (run?.logs) {
      steps = (run.logs as ExecutionLog[]).map((log) => ({
        nodeName: log.nodeName,
        status: log.status,
      }));
    }

    return NextResponse.json({
      appRunId: result.appRunId,
      success: result.success,
      output: result.output,
      cost: result.cost,
      steps,
    });
  } catch (error) {
    if (error instanceof AppRunError) {
      return NextResponse.json(
        { error: error.message },
        { status: STATUS_BY_CODE[error.code] }
      );
    }

    console.error("Error running app:", error);
    return NextResponse.json(
      { error: "The run could not be completed." },
      { status: 500 }
    );
  }
}
