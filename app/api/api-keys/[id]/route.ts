import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, ApiKey, type ApiKeyScope } from "@/lib/db";
import mongoose from "mongoose";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_SCOPES: ApiKeyScope[] = [
  "workflows:read",
  "workflows:write",
  "workflows:execute",
  "executions:read",
  "webhooks:read",
  "webhooks:write",
  "full_access"
];

// GET /api/api-keys/[id] - Get a specific API key
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid API key ID" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const apiKey = await ApiKey.findById(id).lean();

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: apiKey._id.toString(),
      name: apiKey.name,
      description: apiKey.description,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      rateLimit: apiKey.rateLimit,
      rateLimitWindow: apiKey.rateLimitWindow,
      allowedIps: apiKey.allowedIps,
      allowedOrigins: apiKey.allowedOrigins,
      enabled: apiKey.enabled,
      lastUsedAt: apiKey.lastUsedAt?.toISOString(),
      usageCount: apiKey.usageCount,
      expiresAt: apiKey.expiresAt?.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
      updatedAt: apiKey.updatedAt.toISOString()
    });
  } catch (error) {
    console.error("Error fetching API key:", error);
    return NextResponse.json(
      { error: "Failed to fetch API key" },
      { status: 500 }
    );
  }
}

// PUT /api/api-keys/[id] - Update an API key
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid API key ID" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const body = await request.json();
    const {
      name,
      description,
      scopes,
      rateLimit,
      rateLimitWindow,
      allowedIps,
      allowedOrigins,
      enabled,
      expiresAt
    } = body;

    // Build update object
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (enabled !== undefined) update.enabled = enabled;
    if (rateLimit !== undefined) update.rateLimit = rateLimit;
    if (rateLimitWindow !== undefined) update.rateLimitWindow = rateLimitWindow;
    if (allowedIps !== undefined) update.allowedIps = allowedIps;
    if (allowedOrigins !== undefined) update.allowedOrigins = allowedOrigins;
    if (expiresAt !== undefined) update.expiresAt = expiresAt ? new Date(expiresAt) : null;

    // Validate scopes if provided
    if (scopes !== undefined) {
      if (!Array.isArray(scopes) || scopes.length === 0) {
        return NextResponse.json(
          { error: "At least one scope is required" },
          { status: 400 }
        );
      }

      for (const scope of scopes) {
        if (!VALID_SCOPES.includes(scope)) {
          return NextResponse.json(
            { error: `Invalid scope: ${scope}` },
            { status: 400 }
          );
        }
      }
      update.scopes = scopes;
    }

    const apiKey = await ApiKey.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: apiKey._id.toString(),
      name: apiKey.name,
      description: apiKey.description,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      rateLimit: apiKey.rateLimit,
      rateLimitWindow: apiKey.rateLimitWindow,
      allowedIps: apiKey.allowedIps,
      allowedOrigins: apiKey.allowedOrigins,
      enabled: apiKey.enabled,
      lastUsedAt: apiKey.lastUsedAt?.toISOString(),
      usageCount: apiKey.usageCount,
      expiresAt: apiKey.expiresAt?.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
      updatedAt: apiKey.updatedAt.toISOString()
    });
  } catch (error) {
    console.error("Error updating API key:", error);
    return NextResponse.json(
      { error: "Failed to update API key" },
      { status: 500 }
    );
  }
}

// DELETE /api/api-keys/[id] - Delete an API key
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid API key ID" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const apiKey = await ApiKey.findByIdAndDelete(id);

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting API key:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 }
    );
  }
}
