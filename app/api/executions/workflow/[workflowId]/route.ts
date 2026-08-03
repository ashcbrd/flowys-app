import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Execution } from "@/lib/db";
import { getAuthenticatedUser, userOwnsWorkflow } from "@/lib/auth-helpers";

type RouteParams = { params: Promise<{ workflowId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { workflowId } = await params;

    if (!(await userOwnsWorkflow(workflowId, user.id))) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const executions = await Execution.find({ workflowId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    return NextResponse.json(
      executions.map((e) => ({
        id: e._id,
        workflowId: e.workflowId,
        status: e.status,
        input: e.input,
        output: e.output,
        logs: e.logs,
        error: e.error,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        createdAt: e.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching workflow executions:", error);
    return NextResponse.json(
      { error: "Failed to fetch executions" },
      { status: 500 }
    );
  }
}
