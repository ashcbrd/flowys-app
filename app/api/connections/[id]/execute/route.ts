import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Connection, decryptCredentials } from "@/lib/db/models/Connection";
import { integrationRegistry } from "@/lib/integrations/registry";
import type { ConnectionData } from "@/lib/integrations/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/connections/[id]/execute
 * Execute an action on a connection
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const body = await request.json();
    const { actionId, input } = body;

    if (!actionId) {
      return NextResponse.json(
        { error: "actionId is required" },
        { status: 400 }
      );
    }

    const connection = await Connection.findById(id);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    if (!connection.enabled) {
      return NextResponse.json(
        { error: "Connection is disabled" },
        { status: 400 }
      );
    }

    const integration = integrationRegistry.get(connection.integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Verify action exists
    const action = integration.definition.actions.find((a) => a.id === actionId);
    if (!action) {
      return NextResponse.json(
        { error: `Action '${actionId}' not found` },
        { status: 404 }
      );
    }

    // Decrypt credentials
    const credentials = decryptCredentials(
      connection.encryptedCredentials,
      connection.credentialsIv
    );

    // Build connection data
    const connectionData: ConnectionData = {
      id: connection._id,
      integrationId: connection.integrationId,
      name: connection.name,
      credentials,
      metadata: connection.metadata,
      enabled: connection.enabled,
      lastUsedAt: connection.lastUsedAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };

    // Execute action
    const result = await integration.executeAction(actionId, {
      connection: connectionData,
      input: input || {},
    });

    // Update last used timestamp
    connection.lastUsedAt = new Date();
    await connection.save();

    if (result.success) {
      return NextResponse.json({
        success: true,
        output: result.output,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: result.error,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error executing action:", error);
    return NextResponse.json(
      { error: "Failed to execute action" },
      { status: 500 }
    );
  }
}
