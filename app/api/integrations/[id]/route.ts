import { NextResponse } from "next/server";
import { integrationRegistry } from "@/lib/integrations/registry";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/integrations/[id]
 * Get integration details
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const integration = integrationRegistry.get(id);

    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      integration: integration.definition,
    });
  } catch (error) {
    console.error("Error getting integration:", error);
    return NextResponse.json(
      { error: "Failed to get integration" },
      { status: 500 }
    );
  }
}
