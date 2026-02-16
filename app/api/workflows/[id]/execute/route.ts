import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { connectToDatabase, Workflow, Execution } from "@/lib/db";
import { createExecutor } from "@/lib/engine";
import { getAuthenticatedUser, verifyWorkflowOwnership } from "@/lib/auth-helpers";
import { hasEnoughCredits, deductCredits, calculateWorkflowCost } from "@/lib/credits";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // Use nodes/edges from request body if provided (for unsaved changes),
    // otherwise fall back to the saved workflow from database
    const nodesToExecute = body?.nodes && body.nodes.length > 0 ? body.nodes : workflow.nodes;
    const edgesToExecute = body?.edges ? body.edges : workflow.edges;

    const creditCheck = await hasEnoughCredits(user.id, nodesToExecute);
    if (!creditCheck.hasCredits) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          details: `This workflow requires ${creditCheck.required} credits, but only ${creditCheck.remaining} remain.`,
          code: "INSUFFICIENT_CREDITS",
          required: creditCheck.required,
          remaining: creditCheck.remaining,
        },
        { status: 402 }
      );
    }

    const executionId = uuid();
    const now = new Date();

    await Execution.create({
      _id: executionId,
      workflowId: workflow._id,
      status: "running",
      input: body?.input || {},
      startedAt: now,
    });

    const executor = createExecutor(nodesToExecute, edgesToExecute);
    const result = await executor.execute(body?.input || {});
    const creditCost = calculateWorkflowCost(nodesToExecute);
    const deduction = await deductCredits(user.id, creditCost);

    const execution = await Execution.findByIdAndUpdate(
      executionId,
      {
        status: result.success ? "completed" : "failed",
        output: result.output,
        logs: result.logs,
        error: result.error,
        completedAt: new Date(),
      },
      { new: true }
    ).lean();

    return NextResponse.json({
      id: execution!._id,
      workflowId: execution!.workflowId,
      status: execution!.status,
      input: execution!.input,
      output: execution!.output,
      logs: execution!.logs,
      error: execution!.error,
      errorAnalysis: result.errorAnalysis,
      startedAt: execution!.startedAt,
      completedAt: execution!.completedAt,
      createdAt: execution!.createdAt,
      duration: result.duration,
      credits: {
        used: creditCost,
        remaining: deduction.remaining,
      },
    });
  } catch (error) {
    console.error("Error executing workflow:", error);
    return NextResponse.json(
      { error: "Failed to execute workflow" },
      { status: 500 }
    );
  }
}
