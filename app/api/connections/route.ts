import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Connection, encryptCredentials, IConnection } from "@/lib/db/models/Connection";
import { integrationRegistry } from "@/lib/integrations/registry";
import { v4 as uuid } from "uuid";

/**
 * GET /api/connections
 * List all connections
 */
export async function GET(request: Request) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get("integrationId");

    const query: Record<string, unknown> = {};
    if (integrationId) {
      query.integrationId = integrationId;
    }

    const connections = await Connection.find(query)
      .select("-encryptedCredentials -credentialsIv")
      .sort({ createdAt: -1 })
      .lean<IConnection[]>();

    // Add integration info to each connection
    const connectionsWithIntegration = connections.map((conn) => {
      const integration = integrationRegistry.get(conn.integrationId);
      return {
        ...conn,
        integration: integration?.definition.config || null,
      };
    });

    return NextResponse.json({
      connections: connectionsWithIntegration,
      count: connections.length,
    });
  } catch (error) {
    console.error("Error listing connections:", error);
    return NextResponse.json(
      { error: "Failed to list connections" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/connections
 * Create a new connection (for API key / Basic auth integrations)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { integrationId, name, credentials } = body;

    if (!integrationId || !name || !credentials) {
      return NextResponse.json(
        { error: "integrationId, name, and credentials are required" },
        { status: 400 }
      );
    }

    // Get the integration
    const integration = integrationRegistry.get(integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    const config = integration.definition.config;

    // OAuth2 integrations should use the authorize endpoint
    if (config.authType === "oauth2") {
      return NextResponse.json(
        { error: "Use /api/integrations/[id]/authorize for OAuth2 integrations" },
        { status: 400 }
      );
    }

    // Validate credentials
    const validation = await integration.validateCredentials(credentials);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid credentials" },
        { status: 400 }
      );
    }

    // Store connection
    await connectToDatabase();
    const { encrypted, iv } = encryptCredentials(credentials);

    const connection = await Connection.create({
      _id: uuid(),
      integrationId,
      name,
      encryptedCredentials: encrypted,
      credentialsIv: iv,
      metadata: validation.metadata,
      enabled: true,
    });

    return NextResponse.json({
      connection: {
        _id: connection._id,
        integrationId: connection.integrationId,
        name: connection.name,
        metadata: connection.metadata,
        enabled: connection.enabled,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error creating connection:", error);
    return NextResponse.json(
      { error: "Failed to create connection" },
      { status: 500 }
    );
  }
}
