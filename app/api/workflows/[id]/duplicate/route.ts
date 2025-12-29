import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Workflow } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { getAuthenticatedUser, verifyWorkflowOwnership } from "@/lib/auth-helpers";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workflows/[id]/duplicate - Duplicate a workflow
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    // Find the original workflow and verify ownership
    const original = await verifyWorkflowOwnership(id, user.id);
    if (!original) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Parse optional new name from request body
    let newName = `${original.name} (Copy)`;
    try {
      const body = await request.json();
      if (body.name) {
        newName = body.name;
      }
    } catch {
      // No body provided, use default name
    }

    // Create new workflow with copied data
    const newWorkflowId = uuidv4();
    const duplicated = await Workflow.create({
      _id: newWorkflowId,
      userId: user.id,
      name: newName,
      description: original.description,
      nodes: original.nodes.map((node) => ({
        ...node,
        id: `${node.id}_${Date.now()}`, // Generate new node IDs
      })),
      edges: original.edges.map((edge) => ({
        ...edge,
        id: `${edge.id}_${Date.now()}`,
        source: `${edge.source}_${Date.now()}`,
        target: `${edge.target}_${Date.now()}`,
      })),
    });

    // Fix: We need to map edges correctly based on new node IDs
    // Create a mapping from old node IDs to new node IDs
    const nodeIdMap: Record<string, string> = {};
    const timestamp = Date.now();

    original.nodes.forEach((node) => {
      nodeIdMap[node.id] = `${node.id}_${timestamp}`;
    });

    // Update the duplicated workflow with correct node and edge IDs
    const newNodes = original.nodes.map((node) => ({
      ...node,
      id: nodeIdMap[node.id],
    }));

    const newEdges = original.edges.map((edge, index) => ({
      ...edge,
      id: `edge_${timestamp}_${index}`,
      source: nodeIdMap[edge.source] || edge.source,
      target: nodeIdMap[edge.target] || edge.target,
    }));

    // Update the workflow with correct IDs
    await Workflow.findByIdAndUpdate(newWorkflowId, {
      nodes: newNodes,
      edges: newEdges,
    });

    const updated = await Workflow.findById(newWorkflowId).lean();

    return NextResponse.json({
      id: updated!._id,
      name: updated!.name,
      description: updated!.description,
      nodes: updated!.nodes,
      edges: updated!.edges,
      createdAt: updated!.createdAt,
      updatedAt: updated!.updatedAt,
    }, { status: 201 });
  } catch (error) {
    console.error("Error duplicating workflow:", error);
    return NextResponse.json(
      { error: "Failed to duplicate workflow" },
      { status: 500 }
    );
  }
}
