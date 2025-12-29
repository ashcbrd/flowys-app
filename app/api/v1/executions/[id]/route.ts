import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Execution } from "@/lib/db";
import { authenticateApiKey, createApiErrorResponse } from "@/lib/middleware/apiAuth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Public API v1 - Get Execution Status
 *
 * GET /api/v1/executions/:id
 *
 * Required scopes: executions:read
 *
 * Response:
 *   {
 *     data: {
 *       id: string,
 *       workflowId: string,
 *       status: "pending" | "running" | "completed" | "failed",
 *       input: any,
 *       output?: any,
 *       error?: string,
 *       logs: ExecutionLog[],
 *       startedAt: string,
 *       completedAt?: string,
 *       duration?: number
 *     }
 *   }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateApiKey(request, ["executions:read"]);

  if (!authResult.success) {
    return createApiErrorResponse(authResult.error!, authResult.statusCode!);
  }

  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return createApiErrorResponse("Invalid execution ID", 400);
    }

    await connectToDatabase();

    const execution = await Execution.findById(id).lean();

    if (!execution) {
      return createApiErrorResponse("Execution not found", 404);
    }

    // Calculate duration if completed
    let duration: number | undefined;
    if (execution.startedAt && execution.completedAt) {
      duration = new Date(execution.completedAt).getTime() -
                 new Date(execution.startedAt).getTime();
    }

    return NextResponse.json({
      data: {
        id: execution._id.toString(),
        workflowId: execution.workflowId.toString(),
        status: execution.status,
        input: execution.input,
        output: execution.output,
        error: execution.error,
        logs: execution.logs?.map((log: any) => ({
          nodeId: log.nodeId,
          nodeName: log.nodeName,
          status: log.status,
          input: log.input,
          output: log.output,
          error: log.error,
          startedAt: log.startedAt,
          completedAt: log.completedAt
        })) || [],
        startedAt: execution.startedAt?.toISOString(),
        completedAt: execution.completedAt?.toISOString(),
        duration,
        triggeredBy: execution.triggeredBy,
        createdAt: execution.createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error("API v1 error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}
