import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { connectToDatabase, Workflow, Execution } from "@/lib/db";
import { createExecutor } from "@/lib/engine";
import { getAuthenticatedUser, verifyWorkflowOwnership } from "@/lib/auth-helpers";
import { hasEnoughCredits, deductCredits, calculateWorkflowCost } from "@/lib/credits";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const user = await getAuthenticatedUser();
        if (!user) {
          sendEvent("error", { error: "Unauthorized" });
          controller.close();
          return;
        }

        await connectToDatabase();
        const { id } = await params;

        const workflow = await verifyWorkflowOwnership(id, user.id);
        if (!workflow) {
          sendEvent("error", { error: "Workflow not found" });
          controller.close();
          return;
        }

        const body = await request.json().catch(() => ({}));

        const nodesToExecute = body?.nodes && body.nodes.length > 0 ? body.nodes : workflow.nodes;
        const edgesToExecute = body?.edges ? body.edges : workflow.edges;

        const creditCheck = await hasEnoughCredits(user.id, nodesToExecute);
        if (!creditCheck.hasCredits) {
          sendEvent("error", {
            error: "Insufficient credits",
            details: `This workflow requires ${creditCheck.required} credits, but only ${creditCheck.remaining} remain.`,
            code: "INSUFFICIENT_CREDITS",
            required: creditCheck.required,
            remaining: creditCheck.remaining,
          });
          controller.close();
          return;
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

        // Send execution started event
        sendEvent("started", {
          executionId,
          workflowId: workflow._id,
          nodeCount: nodesToExecute.length,
        });

        const executor = createExecutor(nodesToExecute, edgesToExecute);

        // Execute with real-time updates
        const result = await executor.execute(body?.input || {}, (log, allLogs) => {
          sendEvent("node-update", {
            log,
            logs: allLogs,
          });
        });
        const creditCost = calculateWorkflowCost(nodesToExecute);
        const deduction = await deductCredits(user.id, creditCost);

        // Update execution record
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

        // Send completion event
        sendEvent("completed", {
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

        controller.close();
      } catch (error) {
        console.error("Error in streaming execution:", error);
        sendEvent("error", {
          error: error instanceof Error ? error.message : "Failed to execute workflow",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
