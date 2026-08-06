import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase, Workflow, type NodeData, type EdgeData } from "@/lib/db";
import { validateNodeConfig } from "@/lib/nodes";
import { getAuthenticatedUser, verifyWorkflowOwnership } from "@/lib/auth-helpers";

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["input", "api", "ai", "logic", "output", "webhook", "integration", "retrieval"]),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.object({
    label: z.string(),
    config: z.record(z.unknown()),
  }),
});

const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

const WorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    const workflow = await verifyWorkflowOwnership(id, user.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: workflow._id,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    });
  } catch (error) {
    console.error("Error fetching workflow:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    const existing = await verifyWorkflowOwnership(id, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = WorkflowSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid workflow data", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { name, description, nodes, edges } = parsed.data;

    for (const node of nodes) {
      const validation = validateNodeConfig(node.type, node.data.config);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: `Invalid config for node "${node.data.label}"`,
            details: validation.errors,
          },
          { status: 400 }
        );
      }
    }

    const workflow = await Workflow.findByIdAndUpdate(
      id,
      {
        name,
        description: description || null,
        nodes: nodes as NodeData[],
        edges: edges as EdgeData[],
      },
      { new: true }
    ).lean();

    return NextResponse.json({
      id: workflow!._id,
      name: workflow!.name,
      description: workflow!.description,
      nodes: workflow!.nodes,
      edges: workflow!.edges,
      createdAt: workflow!.createdAt,
      updatedAt: workflow!.updatedAt,
    });
  } catch (error) {
    console.error("Error updating workflow:", error);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { id } = await params;

    const existing = await verifyWorkflowOwnership(id, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    await Workflow.findByIdAndDelete(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting workflow:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
