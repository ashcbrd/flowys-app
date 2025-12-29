import { NextRequest, NextResponse } from "next/server";
import { executeNode, type NodeType } from "@/lib/nodes";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeType, nodeId, config, input } = body;

    if (!nodeType) {
      return NextResponse.json(
        { error: "Node type is required" },
        { status: 400 }
      );
    }

    const validTypes: NodeType[] = [
      "input",
      "api",
      "ai",
      "logic",
      "output",
      "webhook",
      "integration",
    ];

    if (!validTypes.includes(nodeType)) {
      return NextResponse.json(
        { error: `Invalid node type: ${nodeType}` },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    const result = await executeNode(nodeType as NodeType, {
      nodeId: nodeId || "test_node",
      inputs: input || {},
      config: config || {},
      globalContext: input || {},
    });

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error,
      duration,
    });
  } catch (error) {
    console.error("Error testing node:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to test node",
      },
      { status: 500 }
    );
  }
}
