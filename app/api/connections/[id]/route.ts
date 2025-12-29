import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Connection, decryptCredentials, IConnection } from "@/lib/db/models/Connection";
import { integrationRegistry } from "@/lib/integrations/registry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connections/[id]
 * Get connection details
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const connection = await Connection.findById(id)
      .select("-encryptedCredentials -credentialsIv")
      .lean<IConnection>();

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const integration = integrationRegistry.get(connection.integrationId);

    return NextResponse.json({
      connection: {
        ...connection,
        integration: integration?.definition.config || null,
      },
    });
  } catch (error) {
    console.error("Error getting connection:", error);
    return NextResponse.json(
      { error: "Failed to get connection" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/connections/[id]
 * Update connection
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;
    const body = await request.json();

    const connection = await Connection.findById(id);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Update allowed fields
    if (body.name !== undefined) {
      connection.name = body.name;
    }
    if (body.enabled !== undefined) {
      connection.enabled = body.enabled;
    }

    await connection.save();

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
    console.error("Error updating connection:", error);
    return NextResponse.json(
      { error: "Failed to update connection" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/connections/[id]
 * Delete connection
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const connection = await Connection.findByIdAndDelete(id);
    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting connection:", error);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }
}
