import { NextRequest, NextResponse } from "next/server";
import { testWebhook } from "@/lib/services/webhookService";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/webhooks/[id]/test - Test a webhook
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid webhook ID" },
        { status: 400 }
      );
    }

    const result = await testWebhook(id);

    return NextResponse.json({
      success: result.success,
      webhookId: result.webhookId,
      logId: result.logId,
      statusCode: result.statusCode,
      duration: result.duration,
      error: result.error
    });
  } catch (error) {
    console.error("Error testing webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to test webhook" },
      { status: 500 }
    );
  }
}
