import { NextRequest, NextResponse } from "next/server";
import { testWebhook } from "@/lib/services/webhookService";
import { connectToDatabase, Webhook } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/webhooks/[id]/test - Test a webhook
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid webhook ID" },
        { status: 400 }
      );
    }

    // Only the webhook's owner may fire a test.
    await connectToDatabase();
    const owned = await Webhook.exists({ _id: id, userId: user.id });
    if (!owned) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
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
