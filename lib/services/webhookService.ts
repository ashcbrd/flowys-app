import {
  connectToDatabase,
  Webhook,
  WebhookLog,
  type IWebhook,
  type WebhookEvent
} from "@/lib/db";
import { generateWebhookSignature } from "@/lib/middleware/apiAuth";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    workflowId?: string;
    workflowName?: string;
    executionId?: string;
    nodeId?: string;
    nodeName?: string;
    status?: string;
    result?: unknown;
    error?: string;
    input?: unknown;
    output?: unknown;
  };
}

export interface WebhookDeliveryResult {
  success: boolean;
  webhookId: string;
  logId: string;
  statusCode?: number;
  error?: string;
  duration?: number;
}

/**
 * Send outgoing webhook for a specific event
 */
export async function triggerWebhooks(
  event: WebhookEvent,
  data: WebhookPayload["data"],
  workflowId?: string
): Promise<WebhookDeliveryResult[]> {
  await connectToDatabase();

  // Find all enabled webhooks subscribed to this event
  const query: Record<string, unknown> = {
    type: "outgoing",
    enabled: true,
    events: event
  };

  // If workflowId is provided, also filter by it
  if (workflowId) {
    query.$or = [
      { workflowId: workflowId },
      { workflowId: { $exists: false } }
    ];
  }

  const webhooks = await Webhook.find(query);
  const results: WebhookDeliveryResult[] = [];

  for (const webhook of webhooks) {
    const result = await deliverWebhook(webhook, event, data);
    results.push(result);
  }

  return results;
}

/**
 * Deliver a single webhook
 */
async function deliverWebhook(
  webhook: IWebhook,
  event: WebhookEvent,
  data: WebhookPayload["data"],
  attemptNumber: number = 1
): Promise<WebhookDeliveryResult> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data
  };

  const payloadString = JSON.stringify(payload);
  const startTime = Date.now();

  // Create log entry
  const log = await WebhookLog.create({
    webhookId: webhook._id,
    workflowId: data.workflowId,
    executionId: data.executionId,
    direction: "outgoing",
    event,
    method: webhook.method || "POST",
    url: webhook.url!,
    requestHeaders: webhook.headers || {},
    requestBody: payload,
    status: "pending",
    attemptNumber
  });

  try {
    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Flowys-Webhook/1.0",
      "X-Webhook-Id": webhook._id.toString(),
      "X-Webhook-Event": event,
      "X-Webhook-Timestamp": payload.timestamp,
      ...(webhook.headers || {})
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      headers["X-Webhook-Signature"] = generateWebhookSignature(
        payloadString,
        webhook.secret
      );
    }

    // Setup abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout);

    // Make the request
    const response = await fetch(webhook.url!, {
      method: webhook.method || "POST",
      headers,
      body: webhook.method !== "GET" ? payloadString : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    // Get response body
    let responseBody = "";
    try {
      responseBody = await response.text();
    } catch {
      responseBody = "[Unable to read response body]";
    }

    // Update log
    await WebhookLog.updateOne(
      { _id: log._id },
      {
        $set: {
          status: response.ok ? "success" : "failed",
          statusCode: response.status,
          responseBody: responseBody.substring(0, 10000), // Limit response size
          duration
        }
      }
    );

    // Update webhook stats
    if (response.ok) {
      await Webhook.updateOne(
        { _id: webhook._id },
        {
          $set: { lastTriggeredAt: new Date() },
          $inc: { successCount: 1 }
        }
      );
    } else {
      await Webhook.updateOne(
        { _id: webhook._id },
        { $inc: { failureCount: 1 } }
      );

      // Schedule retry if needed
      if (attemptNumber < webhook.retryCount) {
        await scheduleRetry(webhook, event, data, log._id.toString(), attemptNumber + 1);
      }
    }

    return {
      success: response.ok,
      webhookId: webhook._id.toString(),
      logId: log._id.toString(),
      statusCode: response.status,
      duration,
      error: response.ok ? undefined : `HTTP ${response.status}: ${responseBody.substring(0, 200)}`
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update log with error
    await WebhookLog.updateOne(
      { _id: log._id },
      {
        $set: {
          status: "failed",
          error: errorMessage,
          duration
        }
      }
    );

    // Update webhook stats
    await Webhook.updateOne(
      { _id: webhook._id },
      { $inc: { failureCount: 1 } }
    );

    // Schedule retry if needed
    if (attemptNumber < webhook.retryCount) {
      await scheduleRetry(webhook, event, data, log._id.toString(), attemptNumber + 1);
    }

    return {
      success: false,
      webhookId: webhook._id.toString(),
      logId: log._id.toString(),
      duration,
      error: errorMessage
    };
  }
}

/**
 * Schedule a webhook retry
 */
async function scheduleRetry(
  webhook: IWebhook,
  event: WebhookEvent,
  data: WebhookPayload["data"],
  logId: string,
  attemptNumber: number
): Promise<void> {
  // Exponential backoff: delay * 2^(attempt-1)
  const delay = webhook.retryDelay * Math.pow(2, attemptNumber - 1);
  const nextRetryAt = new Date(Date.now() + delay);

  await WebhookLog.updateOne(
    { _id: logId },
    {
      $set: {
        status: "retrying",
        nextRetryAt
      }
    }
  );

  // In production, you'd use a job queue like Bull or Agenda
  // For now, we'll use setTimeout (not ideal for production)
  setTimeout(async () => {
    try {
      await deliverWebhook(webhook, event, data, attemptNumber);
    } catch (error) {
      console.error(`Webhook retry failed:`, error);
    }
  }, delay);
}

/**
 * Get webhook delivery logs
 */
export async function getWebhookLogs(
  webhookId?: string,
  workflowId?: string,
  limit: number = 50,
  offset: number = 0
) {
  await connectToDatabase();

  const query: Record<string, unknown> = {};
  if (webhookId) query.webhookId = webhookId;
  if (workflowId) query.workflowId = workflowId;

  const logs = await WebhookLog.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const total = await WebhookLog.countDocuments(query);

  return { logs, total };
}

/**
 * Test a webhook by sending a test payload
 */
export async function testWebhook(webhookId: string): Promise<WebhookDeliveryResult> {
  await connectToDatabase();

  const webhook = await Webhook.findById(webhookId);
  if (!webhook) {
    throw new Error("Webhook not found");
  }

  if (webhook.type !== "outgoing") {
    throw new Error("Can only test outgoing webhooks");
  }

  return deliverWebhook(webhook, "manual", {
    workflowId: webhook.workflowId?.toString(),
    status: "test",
    result: { message: "This is a test webhook delivery from Flowys" }
  });
}
