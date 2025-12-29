import { NextRequest, NextResponse } from "next/server";
import { validateNodeConfig, executeNode, type NodeType } from "@/lib/nodes";

const nodeTypes: NodeType[] = ["input", "api", "ai", "logic", "output"];

const nodeTypeDefinitions = [
  {
    type: "input",
    name: "Input",
    description: "Accepts input data for the workflow",
    configSchema: {
      fields: {
        type: "array",
        items: {
          name: "string",
          type: { enum: ["string", "number", "boolean", "json"] },
          required: "boolean",
          default: "any",
        },
      },
    },
  },
  {
    type: "api",
    name: "API Fetch",
    description: "Fetches data from external APIs",
    configSchema: {
      url: "string",
      method: { enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
      headers: "object",
      body: "string",
      responseMapping: "object",
    },
  },
  {
    type: "ai",
    name: "AI / LLM",
    description: "Executes AI prompts using LLM providers",
    configSchema: {
      provider: { enum: ["openai", "anthropic"] },
      model: "string",
      systemPrompt: "string",
      userPromptTemplate: "string",
      temperature: "number",
      maxTokens: "number",
      outputSchema: "object",
    },
  },
  {
    type: "logic",
    name: "Logic / Filter",
    description: "Applies logic operations to data",
    configSchema: {
      operation: { enum: ["filter", "map", "reduce", "condition", "transform"] },
      condition: "string",
      expression: "string",
      mappings: "object",
    },
  },
  {
    type: "output",
    name: "Output",
    description: "Formats and returns the final output",
    configSchema: {
      format: { enum: ["json", "text", "markdown"] },
      template: "string",
      fields: "array",
    },
  },
];

export async function GET() {
  return NextResponse.json(nodeTypeDefinitions);
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const body = await request.json();

    if (action === "validate") {
      const { type, config } = body;

      if (!type || !nodeTypes.includes(type)) {
        return NextResponse.json({ error: "Invalid node type" }, { status: 400 });
      }

      const result = validateNodeConfig(type, config || {});
      return NextResponse.json(result);
    }

    if (action === "execute") {
      const { type, config, inputs } = body;

      if (!type || !nodeTypes.includes(type)) {
        return NextResponse.json({ error: "Invalid node type" }, { status: 400 });
      }

      const validation = validateNodeConfig(type, config || {});
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Invalid config", details: validation.errors },
          { status: 400 }
        );
      }

      const result = await executeNode(type, {
        nodeId: "test",
        inputs: inputs || {},
        config: config || {},
        globalContext: {},
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error processing node request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
