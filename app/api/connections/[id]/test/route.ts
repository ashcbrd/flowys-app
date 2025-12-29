import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Connection, decryptCredentials } from "@/lib/db/models/Connection";
import { integrationRegistry } from "@/lib/integrations/registry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/connections/[id]/test
 * Test connection credentials
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const connection = await Connection.findById(id);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const integration = integrationRegistry.get(connection.integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    // Decrypt credentials
    const credentials = decryptCredentials(
      connection.encryptedCredentials,
      connection.credentialsIv
    );

    // Validate credentials
    const validation = await integration.validateCredentials(credentials);

    if (validation.valid) {
      // Update metadata if returned
      if (validation.metadata) {
        connection.metadata = { ...connection.metadata, ...validation.metadata };
        await connection.save();
      }

      return NextResponse.json({
        valid: true,
        metadata: validation.metadata,
      });
    }

    return NextResponse.json({
      valid: false,
      error: validation.error,
    });
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      { error: "Failed to test connection" },
      { status: 500 }
    );
  }
}
