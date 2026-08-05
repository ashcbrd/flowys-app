import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Execution } from "@/lib/db";
import { getAuthenticatedUser, getUserWorkflowIds } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const workflowIds = await getUserWorkflowIds(user.id);
    const executions = await Execution.find({ workflowId: { $in: workflowIds } })
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
    console.error("Error fetching executions:", error);
    return NextResponse.json(
      { error: "Failed to fetch executions" },
      { status: 500 }
    );
  }
}
