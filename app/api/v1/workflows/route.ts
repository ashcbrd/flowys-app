import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Workflow } from "@/lib/db";
import { authenticateApiKey, createApiErrorResponse } from "@/lib/middleware/apiAuth";

/**
 * Public API v1 - List Workflows
 *
 * GET /api/v1/workflows
 *
 * Headers:
 *   Authorization: Bearer <api_key>
 *   or
 *   X-API-Key: <api_key>
 *
 * Query params:
 *   limit: number (default: 50)
 *   offset: number (default: 0)
 *
 * Required scopes: workflows:read
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateApiKey(request, ["workflows:read"]);

  if (!authResult.success) {
    return createApiErrorResponse(
      authResult.error!,
      authResult.statusCode!
    );
  }

  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const workflows = await Workflow.find()
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await Workflow.countDocuments();

    return NextResponse.json({
      data: workflows.map((w) => ({
        id: w._id.toString(),
        name: w.name,
        description: w.description,
        nodeCount: w.nodes.length,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString()
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + workflows.length < total
      }
    });
  } catch (error) {
    console.error("API v1 error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}

/**
 * Public API v1 - Create Workflow
 *
 * POST /api/v1/workflows
 *
 * Required scopes: workflows:write
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateApiKey(request, ["workflows:write"]);

  if (!authResult.success) {
    return createApiErrorResponse(
      authResult.error!,
      authResult.statusCode!
    );
  }

  try {
    await connectToDatabase();

    const body = await request.json();
    const { name, description, nodes = [], edges = [] } = body;

    if (!name) {
      return createApiErrorResponse("Name is required", 400);
    }

    const workflow = await Workflow.create({
      name,
      description,
      nodes,
      edges
    });

    return NextResponse.json({
      data: {
        id: workflow._id.toString(),
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString()
      }
    }, { status: 201 });
  } catch (error) {
    console.error("API v1 error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}
