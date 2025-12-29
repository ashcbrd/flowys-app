import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Execution } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const execution = await Execution.findById(id).lean();

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: execution._id,
      workflowId: execution.workflowId,
      status: execution.status,
      input: execution.input,
      output: execution.output,
      logs: execution.logs,
      error: execution.error,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      createdAt: execution.createdAt,
    });
  } catch (error) {
    console.error("Error fetching execution:", error);
    return NextResponse.json(
      { error: "Failed to fetch execution" },
      { status: 500 }
    );
  }
}
