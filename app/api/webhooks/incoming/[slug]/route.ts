import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  connectToDatabase,
  Webhook,
  WebhookLog,
  Workflow,
  Execution
} from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/middleware/apiAuth";
import { WorkflowExecutor } from "@/lib/engine/executor";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// POST /api/webhooks/incoming/[slug] - Trigger a workflow via incoming webhook
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { slug } = await params;

  try {
    await connectToDatabase();

    // Find webhook by slug
    const webhook = await Webhook.findOne({ slug, type: "incoming" });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    if (!webhook.enabled) {
      return NextResponse.json(
        { error: "Webhook is disabled" },
        { status: 403 }
      );
    }

    // Get request details
    const sourceIp = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                     request.headers.get("x-real-ip") ||
                     "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Parse request body
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value;
      });
    }

    // Verify signature if secret is configured
    if (webhook.secret) {
      const signature = request.headers.get("x-webhook-signature") ||
                       request.headers.get("x-hub-signature-256") ||
                       request.headers.get("x-signature");

      if (!signature) {
        // Log the failed attempt
        await WebhookLog.create({
          webhookId: webhook._id,
          workflowId: webhook.workflowId,
          direction: "incoming",
          method: "POST",
          url: request.url,
          requestBody: body,
          status: "failed",
          error: "Missing signature header",
          sourceIp,
          userAgent,
          duration: Date.now() - startTime
        });

        return NextResponse.json(
          { error: "Signature required" },
          { status: 401 }
        );
      }

      const bodyString = JSON.stringify(body);
      if (!verifyWebhookSignature(bodyString, signature, webhook.secret)) {
        // Log the failed attempt
        await WebhookLog.create({
          webhookId: webhook._id,
          workflowId: webhook.workflowId,
          direction: "incoming",
          method: "POST",
          url: request.url,
          requestBody: body,
          status: "failed",
          error: "Invalid signature",
          sourceIp,
          userAgent,
          duration: Date.now() - startTime
        });

        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Get the workflow
    const workflow = await Workflow.findById(webhook.workflowId);

    if (!workflow) {
      return NextResponse.json(
        { error: "Associated workflow not found" },
        { status: 404 }
      );
    }

    // Create execution record
    const executionId = uuid();
    const execution = await Execution.create({
      _id: executionId,
      workflowId: workflow._id,
      status: "running",
      input: body,
      startedAt: new Date(),
      logs: [],
      triggeredBy: "webhook",
      webhookId: webhook._id
    });

    // Create webhook log
    const webhookLog = await WebhookLog.create({
      webhookId: webhook._id,
      workflowId: workflow._id,
      executionId: execution._id,
      direction: "incoming",
      method: "POST",
      url: request.url,
      requestHeaders: Object.fromEntries(request.headers),
      requestBody: body,
      status: "pending",
      sourceIp,
      userAgent
    });

    // Execute workflow
    try {
      const executor = new WorkflowExecutor(workflow.nodes, workflow.edges);
      const result = await executor.execute(body);

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

      // Update webhook log
      await WebhookLog.updateOne(
        { _id: webhookLog._id },
        {
          $set: {
            status: "success",
            statusCode: 200,
            duration: Date.now() - startTime
          }
        }
      );

      // Update webhook stats
      await Webhook.updateOne(
        { _id: webhook._id },
        {
          $set: { lastTriggeredAt: new Date() },
          $inc: { successCount: 1 }
        }
      );

      return NextResponse.json({
        success: true,
        executionId: execution._id.toString(),
        status: result.success ? "completed" : "failed",
        output: result.output,
        error: result.error
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

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

      // Update webhook log
      await WebhookLog.updateOne(
        { _id: webhookLog._id },
        {
          $set: {
            status: "failed",
            error: errorMessage,
            duration: Date.now() - startTime
          }
        }
      );

      // Update webhook stats
      await Webhook.updateOne(
        { _id: webhook._id },
        { $inc: { failureCount: 1 } }
      );

      return NextResponse.json({
        success: false,
        executionId: execution._id.toString(),
        error: errorMessage
      }, { status: 500 });
    }

  } catch (error) {
    console.error("Webhook trigger error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for simple integrations
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;

  try {
    await connectToDatabase();

    const webhook = await Webhook.findOne({ slug, type: "incoming" });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    // Return webhook info without triggering
    return NextResponse.json({
      name: webhook.name,
      enabled: webhook.enabled,
      message: "Send a POST request to trigger this webhook"
    });
  } catch (error) {
    console.error("Webhook GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
