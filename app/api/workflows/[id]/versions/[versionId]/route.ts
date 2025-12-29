import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase, Workflow, WorkflowVersion } from "@/lib/db";
import { getAuthenticatedUser, verifyWorkflowOwnership } from "@/lib/auth-helpers";

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

// GET /api/workflows/[id]/versions/[versionId] - Get a specific version
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id, versionId } = await params;

    // Verify workflow exists and user owns it
    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Find version by ID or version number
    let version;
    if (mongoose.Types.ObjectId.isValid(versionId)) {
      version = await WorkflowVersion.findOne({
        _id: versionId,
        workflowId: id,
      }).lean();
    } else {
      // Try to parse as version number
      const versionNum = parseInt(versionId, 10);
      if (!isNaN(versionNum)) {
        version = await WorkflowVersion.findOne({
          workflowId: id,
          version: versionNum,
        }).lean();
      }
    }

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: version._id.toString(),
      workflowId: id,
      version: version.version,
      name: version.name,
      description: version.description,
      message: version.message,
      nodes: version.nodes,
      edges: version.edges,
      createdAt: version.createdAt.toISOString(),
      createdBy: version.createdBy,
    });
  } catch (error) {
    console.error("Error fetching workflow version:", error);
    return NextResponse.json(
      { error: "Failed to fetch version" },
      { status: 500 }
    );
  }
}

// POST /api/workflows/[id]/versions/[versionId] - Restore a version
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id, versionId } = await params;

    // Verify workflow exists and user owns it
    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Find version by ID or version number
    let version;
    if (mongoose.Types.ObjectId.isValid(versionId)) {
      version = await WorkflowVersion.findOne({
        _id: versionId,
        workflowId: id,
      }).lean();
    } else {
      const versionNum = parseInt(versionId, 10);
      if (!isNaN(versionNum)) {
        version = await WorkflowVersion.findOne({
          workflowId: id,
          version: versionNum,
        }).lean();
      }
    }

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Create a new version of the current state before restoring (for undo)
    const latestVersion = await WorkflowVersion.findOne({ workflowId: id })
      .sort({ version: -1 })
      .lean();

    const currentVersionNumber = latestVersion ? latestVersion.version + 1 : 1;

    // Save current state as a new version
    await WorkflowVersion.create({
      workflowId: id,
      version: currentVersionNumber,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
      message: `Auto-saved before restoring to version ${version.version}`,
    });

    // Restore the workflow to the selected version
    const updatedWorkflow = await Workflow.findByIdAndUpdate(
      id,
      {
        name: version.name,
        description: version.description,
        nodes: version.nodes,
        edges: version.edges,
      },
      { new: true }
    ).lean();

    return NextResponse.json({
      success: true,
      message: `Restored to version ${version.version}`,
      workflow: {
        id: updatedWorkflow!._id,
        name: updatedWorkflow!.name,
        description: updatedWorkflow!.description,
        nodes: updatedWorkflow!.nodes,
        edges: updatedWorkflow!.edges,
        createdAt: updatedWorkflow!.createdAt,
        updatedAt: updatedWorkflow!.updatedAt,
      },
      restoredFromVersion: version.version,
      savedAsVersion: currentVersionNumber,
    });
  } catch (error) {
    console.error("Error restoring workflow version:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}

// DELETE /api/workflows/[id]/versions/[versionId] - Delete a version
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id, versionId } = await params;

    // Verify workflow exists and user owns it
    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    let result;
    if (mongoose.Types.ObjectId.isValid(versionId)) {
      result = await WorkflowVersion.findOneAndDelete({
        _id: versionId,
        workflowId: id,
      });
    } else {
      const versionNum = parseInt(versionId, 10);
      if (!isNaN(versionNum)) {
        result = await WorkflowVersion.findOneAndDelete({
          workflowId: id,
          version: versionNum,
        });
      }
    }

    if (!result) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting workflow version:", error);
    return NextResponse.json(
      { error: "Failed to delete version" },
      { status: 500 }
    );
  }
}
