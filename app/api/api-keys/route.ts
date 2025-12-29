import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, ApiKey, generateApiKey, type ApiKeyScope } from "@/lib/db";

const VALID_SCOPES: ApiKeyScope[] = [
  "workflows:read",
  "workflows:write",
  "workflows:execute",
  "executions:read",
  "webhooks:read",
  "webhooks:write",
  "full_access"
];

// GET /api/api-keys - List all API keys
export async function GET() {
  try {
    await connectToDatabase();

    const apiKeys = await ApiKey.find()
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      apiKeys.map((key) => ({
        id: key._id.toString(),
        name: key.name,
        description: key.description,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        rateLimit: key.rateLimit,
        rateLimitWindow: key.rateLimitWindow,
        allowedIps: key.allowedIps,
        allowedOrigins: key.allowedOrigins,
        enabled: key.enabled,
        lastUsedAt: key.lastUsedAt?.toISOString(),
        usageCount: key.usageCount,
        expiresAt: key.expiresAt?.toISOString(),
        createdAt: key.createdAt.toISOString(),
        updatedAt: key.updatedAt.toISOString()
      }))
    );
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 }
    );
  }
}

// POST /api/api-keys - Create a new API key
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const {
      name,
      description,
      scopes = ["workflows:read", "executions:read"],
      rateLimit = 60,
      rateLimitWindow = 60,
      allowedIps,
      allowedOrigins,
      expiresAt
    } = body;

    // Validation
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(scopes) || scopes.length === 0) {
      return NextResponse.json(
        { error: "At least one scope is required" },
        { status: 400 }
      );
    }

    // Validate scopes
    for (const scope of scopes) {
      if (!VALID_SCOPES.includes(scope)) {
        return NextResponse.json(
          { error: `Invalid scope: ${scope}. Valid scopes: ${VALID_SCOPES.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Generate the API key
    const { key, prefix, hash } = generateApiKey();

    const apiKey = await ApiKey.create({
      name,
      description,
      keyPrefix: prefix,
      keyHash: hash,
      scopes,
      rateLimit,
      rateLimitWindow,
      allowedIps: allowedIps || [],
      allowedOrigins: allowedOrigins || [],
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });

    // IMPORTANT: Return the full key only on creation
    // It cannot be retrieved later
    return NextResponse.json({
      id: apiKey._id.toString(),
      name: apiKey.name,
      description: apiKey.description,
      key, // Full key - only shown once!
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      rateLimit: apiKey.rateLimit,
      rateLimitWindow: apiKey.rateLimitWindow,
      allowedIps: apiKey.allowedIps,
      allowedOrigins: apiKey.allowedOrigins,
      enabled: apiKey.enabled,
      expiresAt: apiKey.expiresAt?.toISOString(),
      createdAt: apiKey.createdAt.toISOString(),
      message: "Save this API key now. It will not be shown again."
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
