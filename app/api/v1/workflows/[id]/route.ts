import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Workflow } from "@/lib/db";
import { authenticateApiKey, createApiErrorResponse } from "@/lib/middleware/apiAuth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Public API v1 - Get Workflow
 *
 * GET /api/v1/workflows/:id
 *
 * Required scopes: workflows:read
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateApiKey(request, ["workflows:read"]);

  if (!authResult.success) {
    return createApiErrorResponse(authResult.error!, authResult.statusCode!);
  }

  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return createApiErrorResponse("Invalid workflow ID", 400);
    }

    await connectToDatabase();

    const workflow = await Workflow.findById(id).lean();

    if (!workflow) {
      return createApiErrorResponse("Workflow not found", 404);
    }

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
    });
  } catch (error) {
    console.error("API v1 error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}

/**
 * Public API v1 - Update Workflow
 *
 * PUT /api/v1/workflows/:id
 *
 * Required scopes: workflows:write
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateApiKey(request, ["workflows:write"]);

  if (!authResult.success) {
    return createApiErrorResponse(authResult.error!, authResult.statusCode!);
  }

  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return createApiErrorResponse("Invalid workflow ID", 400);
    }

    await connectToDatabase();

    const body = await request.json();
    const { name, description, nodes, edges } = body;

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (nodes !== undefined) update.nodes = nodes;
    if (edges !== undefined) update.edges = edges;

    const workflow = await Workflow.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!workflow) {
      return createApiErrorResponse("Workflow not found", 404);
    }

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
    });
  } catch (error) {
    console.error("API v1 error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}

/**
 * Public API v1 - Delete Workflow
 *
 * DELETE /api/v1/workflows/:id
 *
 * Required scopes: workflows:write
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateApiKey(request, ["workflows:write"]);

  if (!authResult.success) {
    return createApiErrorResponse(authResult.error!, authResult.statusCode!);
  }

  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return createApiErrorResponse("Invalid workflow ID", 400);
    }

    await connectToDatabase();

    const workflow = await Workflow.findByIdAndDelete(id);

    if (!workflow) {
      return createApiErrorResponse("Workflow not found", 404);
    }

    return NextResponse.json({
      data: { deleted: true, id }
    });
  } catch (error) {
    console.error("API v1 error:", error);
    return createApiErrorResponse("Internal server error", 500);
  }
}
