import { NextRequest, NextResponse } from "next/server";
import { getWebhookLogs } from "@/lib/services/webhookService";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/webhooks/[id]/logs - Get webhook delivery logs
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid webhook ID" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { logs, total } = await getWebhookLogs(id, undefined, limit, offset);

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log._id.toString(),
        webhookId: log.webhookId.toString(),
        workflowId: log.workflowId?.toString(),
        executionId: log.executionId?.toString(),
        direction: log.direction,
        event: log.event,
        method: log.method,
        url: log.url,
        status: log.status,
        statusCode: log.statusCode,
        error: log.error,
        duration: log.duration,
        attemptNumber: log.attemptNumber,
        sourceIp: log.sourceIp,
        createdAt: log.createdAt.toISOString()
      })),
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error("Error fetching webhook logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhook logs" },
      { status: 500 }
    );
  }
}
