import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Webhook } from "@/lib/db";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/webhooks/[id] - Get a specific webhook
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid webhook ID" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const webhook = await Webhook.findById(id).lean();

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    return NextResponse.json({
      id: webhook._id.toString(),
      name: webhook.name,
      description: webhook.description,
      type: webhook.type,
      workflowId: webhook.workflowId?.toString(),
      slug: webhook.slug,
      url: webhook.url,
      method: webhook.method,
      headers: webhook.headers || {},
      events: webhook.events,
      enabled: webhook.enabled,
      retryCount: webhook.retryCount,
      retryDelay: webhook.retryDelay,
      timeout: webhook.timeout,
      lastTriggeredAt: webhook.lastTriggeredAt?.toISOString(),
      successCount: webhook.successCount,
      failureCount: webhook.failureCount,
      createdAt: webhook.createdAt.toISOString(),
      updatedAt: webhook.updatedAt.toISOString(),
      triggerUrl: webhook.type === "incoming" && webhook.slug
        ? `${baseUrl}/api/webhooks/incoming/${webhook.slug}`
        : undefined
    });
  } catch (error) {
    console.error("Error fetching webhook:", error);
    return NextResponse.json(
      { error: "Failed to fetch webhook" },
      { status: 500 }
    );
  }
}

// PUT /api/webhooks/[id] - Update a webhook
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid webhook ID" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const body = await request.json();
    const {
      name,
      description,
      workflowId,
      url,
      method,
      headers,
      events,
      enabled,
      retryCount,
      retryDelay,
      timeout
    } = body;

    const webhook = await Webhook.findById(id);

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    // Build update object
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (workflowId !== undefined) update.workflowId = workflowId;
    if (enabled !== undefined) update.enabled = enabled;
    if (retryCount !== undefined) update.retryCount = retryCount;
    if (retryDelay !== undefined) update.retryDelay = retryDelay;
    if (timeout !== undefined) update.timeout = timeout;

    // Only update outgoing-specific fields for outgoing webhooks
    if (webhook.type === "outgoing") {
      if (url !== undefined) {
        try {
          new URL(url);
          update.url = url;
        } catch {
          return NextResponse.json(
            { error: "Invalid URL format" },
            { status: 400 }
          );
        }
      }
      if (method !== undefined) update.method = method;
      if (headers !== undefined) update.headers = headers;
      if (events !== undefined) update.events = events;
    }

    const updatedWebhook = await Webhook.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    return NextResponse.json({
      id: updatedWebhook!._id.toString(),
      name: updatedWebhook!.name,
      description: updatedWebhook!.description,
      type: updatedWebhook!.type,
      workflowId: updatedWebhook!.workflowId?.toString(),
      slug: updatedWebhook!.slug,
      url: updatedWebhook!.url,
      method: updatedWebhook!.method,
      headers: updatedWebhook!.headers || {},
      events: updatedWebhook!.events,
      enabled: updatedWebhook!.enabled,
      retryCount: updatedWebhook!.retryCount,
      retryDelay: updatedWebhook!.retryDelay,
      timeout: updatedWebhook!.timeout,
      lastTriggeredAt: updatedWebhook!.lastTriggeredAt?.toISOString(),
      successCount: updatedWebhook!.successCount,
      failureCount: updatedWebhook!.failureCount,
      createdAt: updatedWebhook!.createdAt.toISOString(),
      updatedAt: updatedWebhook!.updatedAt.toISOString(),
      triggerUrl: updatedWebhook!.type === "incoming" && updatedWebhook!.slug
        ? `${baseUrl}/api/webhooks/incoming/${updatedWebhook!.slug}`
        : undefined
    });
  } catch (error) {
    console.error("Error updating webhook:", error);
    return NextResponse.json(
      { error: "Failed to update webhook" },
      { status: 500 }
    );
  }
}

// DELETE /api/webhooks/[id] - Delete a webhook
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid webhook ID" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const webhook = await Webhook.findByIdAndDelete(id);

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting webhook:", error);
    return NextResponse.json(
      { error: "Failed to delete webhook" },
      { status: 500 }
    );
  }
}
