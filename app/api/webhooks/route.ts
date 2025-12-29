import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Webhook, type WebhookEvent } from "@/lib/db";

// GET /api/webhooks - List all webhooks
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const workflowId = searchParams.get("workflowId");
    const enabled = searchParams.get("enabled");

    const query: Record<string, unknown> = {};
    if (type) query.type = type;
    if (workflowId) query.workflowId = workflowId;
    if (enabled !== null) query.enabled = enabled === "true";

    const webhooks = await Webhook.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      webhooks.map((w) => ({
        id: w._id.toString(),
        name: w.name,
        description: w.description,
        type: w.type,
        workflowId: w.workflowId?.toString(),
        slug: w.slug,
        url: w.url,
        method: w.method,
        headers: w.headers || {},
        events: w.events,
        enabled: w.enabled,
        retryCount: w.retryCount,
        retryDelay: w.retryDelay,
        timeout: w.timeout,
        lastTriggeredAt: w.lastTriggeredAt?.toISOString(),
        successCount: w.successCount,
        failureCount: w.failureCount,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
        // For incoming webhooks, provide the full trigger URL
        triggerUrl: w.type === "incoming" && w.slug
          ? `${getBaseUrl(request)}/api/webhooks/incoming/${w.slug}`
          : undefined
      }))
    );
  } catch (error) {
    console.error("Error fetching webhooks:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhooks" },
      { status: 500 }
    );
  }
}

// POST /api/webhooks - Create a new webhook
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const {
      name,
      description,
      type,
      workflowId,
      url,
      method,
      headers,
      events,
      enabled = true,
      retryCount = 3,
      retryDelay = 1000,
      timeout = 30000
    } = body;

    // Validation
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!type || !["incoming", "outgoing"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'incoming' or 'outgoing'" },
        { status: 400 }
      );
    }

    if (type === "outgoing") {
      if (!url || typeof url !== "string") {
        return NextResponse.json(
          { error: "URL is required for outgoing webhooks" },
          { status: 400 }
        );
      }

      try {
        new URL(url);
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format" },
          { status: 400 }
        );
      }

      if (!events || !Array.isArray(events) || events.length === 0) {
        return NextResponse.json(
          { error: "At least one event is required for outgoing webhooks" },
          { status: 400 }
        );
      }
    }

    if (type === "incoming" && !workflowId) {
      return NextResponse.json(
        { error: "Workflow ID is required for incoming webhooks" },
        { status: 400 }
      );
    }

    const webhook = await Webhook.create({
      name,
      description,
      type,
      workflowId,
      url: type === "outgoing" ? url : undefined,
      method: type === "outgoing" ? (method || "POST") : undefined,
      headers: type === "outgoing" ? headers : undefined,
      events: type === "outgoing" ? events : undefined,
      enabled,
      retryCount,
      retryDelay,
      timeout
    });

    return NextResponse.json({
      id: webhook._id.toString(),
      name: webhook.name,
      description: webhook.description,
      type: webhook.type,
      workflowId: webhook.workflowId?.toString(),
      slug: webhook.slug,
      secret: webhook.secret, // Only shown on creation
      url: webhook.url,
      method: webhook.method,
      headers: webhook.headers || {},
      events: webhook.events,
      enabled: webhook.enabled,
      retryCount: webhook.retryCount,
      retryDelay: webhook.retryDelay,
      timeout: webhook.timeout,
      createdAt: webhook.createdAt.toISOString(),
      updatedAt: webhook.updatedAt.toISOString(),
      triggerUrl: webhook.type === "incoming" && webhook.slug
        ? `${getBaseUrl(request)}/api/webhooks/incoming/${webhook.slug}`
        : undefined
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating webhook:", error);
    return NextResponse.json(
      { error: "Failed to create webhook" },
      { status: 500 }
    );
  }
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}
