import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Workflow, WorkflowVersion } from "@/lib/db";
import { getAuthenticatedUser, verifyWorkflowOwnership } from "@/lib/auth-helpers";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/workflows/[id]/versions - List all versions of a workflow
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    // Verify workflow exists and user owns it
    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Get all versions sorted by version number descending
    const versions = await WorkflowVersion.find({ workflowId: id })
      .sort({ version: -1 })
      .lean();

    return NextResponse.json({
      workflowId: id,
      currentVersion: versions.length > 0 ? versions[0].version + 1 : 1,
      versions: versions.map((v) => ({
        id: v._id.toString(),
        version: v.version,
        name: v.name,
        description: v.description,
        message: v.message,
        nodeCount: v.nodes.length,
        edgeCount: v.edges.length,
        createdAt: v.createdAt.toISOString(),
        createdBy: v.createdBy,
      })),
    });
  } catch (error) {
    console.error("Error fetching workflow versions:", error);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}

// POST /api/workflows/[id]/versions - Create a new version (snapshot)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    // Get the current workflow and verify ownership
    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Parse optional message from request body
    let message = "";
    try {
      const body = await request.json();
      if (body.message) {
        message = body.message;
      }
    } catch {
      // No body provided
    }

    // Get the latest version number
    const latestVersion = await WorkflowVersion.findOne({ workflowId: id })
      .sort({ version: -1 })
      .lean();

    const newVersionNumber = latestVersion ? latestVersion.version + 1 : 1;

    // Create the version snapshot
    const version = await WorkflowVersion.create({
      workflowId: id,
      version: newVersionNumber,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
      message: message || `Version ${newVersionNumber}`,
    });

    return NextResponse.json({
      id: version._id.toString(),
      workflowId: id,
      version: version.version,
      name: version.name,
      description: version.description,
      message: version.message,
      nodeCount: version.nodes.length,
      edgeCount: version.edges.length,
      createdAt: version.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating workflow version:", error);
    return NextResponse.json(
      { error: "Failed to create version" },
      { status: 500 }
    );
  }
}
