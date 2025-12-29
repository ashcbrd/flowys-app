import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { connectToDatabase, Workflow, Execution } from "@/lib/db";
import { authenticateApiKey, createApiErrorResponse } from "@/lib/middleware/apiAuth";
import { WorkflowExecutor } from "@/lib/engine/executor";
import { triggerWebhooks } from "@/lib/services/webhookService";
import {
  hasEnoughCredits,
  deductCredits,
  validateWorkflowAgainstPlan,
  calculateWorkflowCost,
} from "@/lib/subscription";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Public API v1 - Trigger Workflow Execution
 *
 * POST /api/v1/workflows/:id/trigger
 *
 * Headers:
 *   Authorization: Bearer <api_key>
 *   X-Async: true/false (optional, default: false)
 *
 * Body:
 *   { input: { ... } }
 *
 * Required scopes: workflows:execute
 *
 * Response (sync mode):
 *   {
 *     data: {
 *       executionId: string,
 *       status: "completed" | "failed",
 *       output: any,
 *       error?: string,
 *       duration: number
 *     }
 *   }
 *
 * Response (async mode):
 *   {
 *     data: {
 *       executionId: string,
 *       status: "running",
 *       statusUrl: string
 *     }
 *   }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateApiKey(request, ["workflows:execute"]);

  if (!authResult.success) {
    return createApiErrorResponse(authResult.error!, authResult.statusCode!);
  }

  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return createApiErrorResponse("Invalid workflow ID", 400);
    }

    await connectToDatabase();

    const workflow = await Workflow.findById(id);

    if (!workflow) {
      return createApiErrorResponse("Workflow not found", 404);
    }

    // Validate workflow against plan limits (node types, node count)
    const validation = await validateWorkflowAgainstPlan(workflow.userId, workflow.nodes);
    if (!validation.valid) {
      return createApiErrorResponse(
        `Plan limit exceeded: ${validation.errors.join(", ")}`,
        403
      );
    }

    // Check if user has enough credits
    const creditCheck = await hasEnoughCredits(workflow.userId, workflow.nodes);
    if (!creditCheck.hasCredits) {
      return createApiErrorResponse(
        `Insufficient credits. Required: ${creditCheck.required}, Remaining: ${creditCheck.remaining}`,
        402
      );
    }

    // Parse input
    let input: Record<string, unknown> = {};
    try {
      const body = await request.json();
      input = body.input || body || {};
    } catch {
      // Empty body is okay
    }

    // Check if async mode
    const isAsync = request.headers.get("X-Async") === "true";

    // Create execution record
    const executionId = uuid();
    const execution = await Execution.create({
      _id: executionId,
      workflowId: workflow._id,
      status: "running",
      input,
      startedAt: new Date(),
      logs: [],
      triggeredBy: "api",
      apiKeyId: authResult.apiKey?.id
    });

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    // Trigger workflow.started webhooks
    await triggerWebhooks("workflow.started", {
      workflowId: workflow._id.toString(),
      workflowName: workflow.name,
      executionId: execution._id.toString(),
      status: "running",
      input
    }, workflow._id.toString());

    if (isAsync) {
      // Async mode - start execution in background and return immediately
      executeWorkflowAsync(workflow, execution, input, baseUrl);

      return NextResponse.json({
        data: {
          executionId: execution._id.toString(),
          status: "running",
          statusUrl: `${baseUrl}/api/v1/executions/${execution._id}`
        }
      }, { status: 202 });
    }

    // Sync mode - wait for execution to complete
    const startTime = Date.now();

    try {
      const executor = new WorkflowExecutor(workflow.nodes, workflow.edges);
      const result = await executor.execute(input);

      const duration = Date.now() - startTime;

      // Deduct credits after execution
      const creditCost = calculateWorkflowCost(workflow.nodes);
      const deduction = await deductCredits(workflow.userId, creditCost);

      // Update execution
      await Execution.updateOne(
        { _id: execution._id },
        {
          $set: {
            status: result.success ? "completed" : "failed",
            output: result.output,
            error: result.error,
            completedAt: new Date(),
            logs: result.logs
          }
        }
      );

      // Trigger completion webhooks
      await triggerWebhooks(
        result.success ? "workflow.completed" : "workflow.failed",
        {
          workflowId: workflow._id.toString(),
          workflowName: workflow.name,
          executionId: execution._id.toString(),
          status: result.success ? "completed" : "failed",
          output: result.output,
          error: result.error
        },
        workflow._id.toString()
      );

      return NextResponse.json({
        data: {
          executionId: execution._id.toString(),
          status: result.success ? "completed" : "failed",
          output: result.output,
          error: result.error,
          duration,
          credits: {
            used: creditCost,
            remaining: deduction.remaining,
          },
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;

      // Update execution
      await Execution.updateOne(
        { _id: execution._id },
        {
          $set: {
            status: "failed",
            error: errorMessage,
            completedAt: new Date()
          }
        }
      );

      // Trigger failure webhook
      await triggerWebhooks("workflow.failed", {
        workflowId: workflow._id.toString(),
        workflowName: workflow.name,
        executionId: execution._id.toString(),
        status: "failed",
        error: errorMessage
      }, workflow._id.toString());

      return NextResponse.json({
        data: {
          executionId: execution._id.toString(),
          status: "failed",
          error: errorMessage,
          duration
        }
      }, { status: 500 });
    }

  } catch (error) {
    console.error("API v1 trigger error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}

// Background execution handler
async function executeWorkflowAsync(
  workflow: any,
  execution: any,
  input: Record<string, unknown>,
  baseUrl: string
) {
  try {
    const executor = new WorkflowExecutor(workflow.nodes, workflow.edges);
    const result = await executor.execute(input);

    // Deduct credits after execution
    const creditCost = calculateWorkflowCost(workflow.nodes);
    await deductCredits(workflow.userId, creditCost);

    // Update execution
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status: result.success ? "completed" : "failed",
          output: result.output,
          error: result.error,
          completedAt: new Date(),
          logs: result.logs
        }
      }
    );

    // Trigger completion webhooks
    await triggerWebhooks(
      result.success ? "workflow.completed" : "workflow.failed",
      {
        workflowId: workflow._id.toString(),
        workflowName: workflow.name,
        executionId: execution._id.toString(),
        status: result.success ? "completed" : "failed",
        output: result.output,
        error: result.error
      },
      workflow._id.toString()
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          status: "failed",
          error: errorMessage,
          completedAt: new Date()
        }
      }
    );

    await triggerWebhooks("workflow.failed", {
      workflowId: workflow._id.toString(),
      workflowName: workflow.name,
      executionId: execution._id.toString(),
      status: "failed",
      error: errorMessage
    }, workflow._id.toString());
  }
}
