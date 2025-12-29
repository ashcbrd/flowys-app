import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { connectToDatabase, Workflow, type NodeData, type EdgeData } from "@/lib/db";
import { validateNodeConfig } from "@/lib/nodes";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getUserPlanLimits, validateWorkflowAgainstPlan } from "@/lib/subscription";

const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["input", "api", "ai", "logic", "output", "webhook", "integration"]),
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

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const workflows = await Workflow.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      workflows.map((w) => ({
        id: w._id,
        name: w.name,
        description: w.description,
        nodes: w.nodes,
        edges: w.edges,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching workflows:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflows" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const body = await request.json();
    const parsed = WorkflowSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid workflow data", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { name, description, nodes, edges } = parsed.data;

    // Check workflow count limit
    const workflowCount = await Workflow.countDocuments({ userId: user.id });
    const { subscription, limits } = await getUserPlanLimits(user.id);

    if (limits.maxWorkflows !== -1 && workflowCount >= limits.maxWorkflows) {
      return NextResponse.json(
        {
          error: "Workflow limit reached",
          details: `Your ${subscription.plan} plan allows up to ${limits.maxWorkflows} workflows. Upgrade to create more.`,
          code: "WORKFLOW_LIMIT_REACHED",
          current: workflowCount,
          limit: limits.maxWorkflows,
        },
        { status: 403 }
      );
    }

    // Validate nodes against plan (node types and count)
    const planValidation = await validateWorkflowAgainstPlan(user.id, nodes as NodeData[]);
    if (!planValidation.valid) {
      return NextResponse.json(
        {
          error: "Plan limit exceeded",
          details: planValidation.errors,
          code: "PLAN_LIMIT_EXCEEDED",
        },
        { status: 403 }
      );
    }

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

    const id = uuid();

    const workflow = await Workflow.create({
      _id: id,
      userId: user.id,
      name,
      description: description || null,
      nodes: nodes as NodeData[],
      edges: edges as EdgeData[],
    });

    return NextResponse.json(
      {
        id: workflow._id,
        name: workflow.name,
        description: workflow.description,
        nodes: workflow.nodes,
        edges: workflow.edges,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating workflow:", error);
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 }
    );
  }
}
