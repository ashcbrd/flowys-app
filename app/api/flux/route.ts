import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ChatMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  workflow: z
    .object({
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
    })
    .optional(),
  executionLogs: z.array(z.any()).optional(),
  lastExecution: z
    .object({
      status: z.string(),
      error: z.string().nullable().optional(),
      output: z.any().optional(),
    })
    .nullable()
    .optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

const SYSTEM_PROMPT = `You are Flux, the AI assistant for Flowys - a node-based workflow automation platform.

YOUR CAPABILITIES:
1. Create complete workflows from user descriptions
2. Analyze and fix workflow errors
3. Answer questions about Flowys
4. Only answer questions about Flowys (redirect off-topic questions politely)

NODE TYPES (use exactly these type values):
- "input" - Accepts workflow input. Config: { fields: [{ name: string, type: "string"|"number"|"boolean"|"json", required?: boolean, default?: any }] }
- "api" - HTTP requests. Config: { url: string, method: "GET"|"POST"|"PUT"|"DELETE", headers?: object, body?: string, responseMapping?: object }
- "ai" - LLM prompts. Config: { provider: "openai"|"anthropic", model: string, systemPrompt?: string, userPromptTemplate: string, temperature?: number, maxTokens?: number, outputSchema: { type: "object", properties: object, required: string[] } }
- "logic" - Data operations. Config: { operation: "filter"|"map"|"reduce"|"condition"|"transform", condition?: string, expression?: string, mappings?: object }
- "output" - Final result. Config: { format: "json"|"text"|"markdown", template?: string, fields?: string[] }

WORKFLOW CREATION:
When a user asks to CREATE a workflow, you MUST generate a complete workflow with:
1. Unique node IDs (use format: node_1, node_2, etc.)
2. Proper positions (start at x:100, increment by 300 for each node horizontally)
3. All y positions at 200 for a horizontal layout
4. Complete configurations for each node
5. Edges connecting the nodes in sequence

For AI nodes, ALWAYS include a complete outputSchema with type, properties, and required fields.

RESPONSE FORMAT (ALWAYS VALID JSON):
{
  "message": "Your response",
  "workflowGeneration": {
    "description": "Brief description of what this workflow does",
    "nodes": [
      {
        "id": "node_1",
        "type": "input",
        "position": { "x": 100, "y": 200 },
        "data": {
          "label": "User Input",
          "config": { "fields": [{ "name": "text", "type": "string", "required": true }] }
        }
      }
    ],
    "edges": [
      { "id": "edge_1", "source": "node_1", "target": "node_2" }
    ]
  },
  "errorAnalysis": { ... },
  "suggestedFix": { ... },
  "suggestions": ["Follow-up 1", "Follow-up 2"]
}

IMPORTANT:
- Only include "workflowGeneration" when user asks to CREATE/BUILD/MAKE a workflow
- Only include "errorAnalysis" when there's an actual error
- Only include "suggestedFix" when suggesting a fix for an error
- For outputSchema in AI nodes, always include type:"object", properties with descriptions, and required array

Always respond with ONLY valid JSON.`;

export async function GET() {
  return NextResponse.json({
    suggestions: [
      "Create a text summarization workflow",
      "Build a sentiment analysis workflow",
      "Create an API data enrichment workflow",
      "Make a simple chatbot workflow",
      "What node types are available?",
      "How do I use variables?",
      "Help me fix my workflow",
      "Analyze my current workflow",
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ChatMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { message, workflow, executionLogs, lastExecution, conversationHistory } =
      parsed.data;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    let userMessage = message;

    const hasNodes = workflow?.nodes && workflow.nodes.length > 0;
    const hasEdges = workflow?.edges && workflow.edges.length > 0;

    userMessage += "\n\n=== CURRENT WORKFLOW STATE ===";

    if (hasNodes) {
      userMessage += `\nNodes (${workflow.nodes!.length}):`;
      for (const node of workflow.nodes!) {
        userMessage += `\n- ID: ${node.id}`;
        userMessage += `\n  Type: ${node.type}`;
        userMessage += `\n  Label: "${node.data?.label || "Unnamed"}"`;
        if (node.data?.config) {
          userMessage += `\n  Config: ${JSON.stringify(node.data.config)}`;
        }
      }
    } else {
      userMessage += "\nNo nodes on canvas (empty workflow).";
    }

    if (hasEdges) {
      userMessage += `\n\nConnections (${workflow.edges!.length}):`;
      for (const edge of workflow.edges!) {
        userMessage += `\n- ${edge.source} → ${edge.target}`;
      }
    }

    if (executionLogs && executionLogs.length > 0) {
      userMessage += "\n\n=== EXECUTION LOGS ===";
      for (const log of executionLogs) {
        userMessage += `\n\nNode: ${log.nodeName} (${log.nodeId})`;
        userMessage += `\nStatus: ${log.status}`;
        if (log.duration) userMessage += `\nDuration: ${log.duration}ms`;
        if (log.input) userMessage += `\nInput: ${JSON.stringify(log.input)}`;
        if (log.output) userMessage += `\nOutput: ${JSON.stringify(log.output)}`;
        if (log.error) userMessage += `\nERROR: ${log.error}`;
      }
    }

    if (lastExecution) {
      userMessage += "\n\n=== LAST EXECUTION RESULT ===";
      userMessage += `\nStatus: ${lastExecution.status}`;
      if (lastExecution.error) {
        userMessage += `\nError: ${lastExecution.error}`;
      }
    }

    messages.push({ role: "user", content: userMessage });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    try {
      const parsedContent = JSON.parse(content);

      const result: Record<string, unknown> = {
        message: parsedContent.message || "I'm not sure how to help with that.",
        suggestions: Array.isArray(parsedContent.suggestions)
          ? parsedContent.suggestions.slice(0, 4)
          : ["Create a simple workflow", "What can you do?"],
      };

      if (
        parsedContent.workflowGeneration &&
        parsedContent.workflowGeneration.nodes &&
        parsedContent.workflowGeneration.nodes.length > 0
      ) {
        result.workflowGeneration = {
          description:
            parsedContent.workflowGeneration.description || "Generated workflow",
          nodes: parsedContent.workflowGeneration.nodes,
          edges: parsedContent.workflowGeneration.edges || [],
        };
      }

      if (parsedContent.errorAnalysis && parsedContent.errorAnalysis.hasError) {
        result.errorAnalysis = {
          hasError: true,
          errorNode: parsedContent.errorAnalysis.errorNode,
          errorMessage: parsedContent.errorAnalysis.errorMessage,
          errorReason: parsedContent.errorAnalysis.errorReason,
        };
      }

      if (parsedContent.suggestedFix && parsedContent.suggestedFix.explanation) {
        result.suggestedFix = {
          explanation: parsedContent.suggestedFix.explanation,
          manualSteps: Array.isArray(parsedContent.suggestedFix.manualSteps)
            ? parsedContent.suggestedFix.manualSteps
            : [],
        };

        if (
          parsedContent.suggestedFix.autoFix &&
          parsedContent.suggestedFix.autoFix.type &&
          parsedContent.suggestedFix.autoFix.description
        ) {
          (result.suggestedFix as Record<string, unknown>).autoFix =
            parsedContent.suggestedFix.autoFix;
        }
      }

      return NextResponse.json(result);
    } catch {
      return NextResponse.json({
        message: content,
        suggestions: ["Create a workflow", "What can you do?"],
      });
    }
  } catch (error) {
    console.error("Flux error:", error);
    return NextResponse.json(
      {
        message: "Sorry, I encountered an error. Please try again.",
        suggestions: ["Try again", "What can you help with?"],
      },
      { status: 500 }
    );
  }
}
