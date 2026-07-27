import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { INTEGRATIONS_ENABLED } from "@/lib/features";

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
- "ai" - LLM prompts. Config: { systemPrompt?: string, userPromptTemplate: string, temperature?: number, maxTokens?: number, outputSchema: { type: "object", properties: object, required: string[] } }
  NEVER include "provider" or "model" on an ai node. The system chooses which AI
  runs each step; naming one would be ignored at best and wrong at worst.

- "logic" - Data operations. Config: { operation: "filter"|"map"|"reduce"|"condition"|"transform", condition?: string, expression?: string, mappings?: object }
- "output" - Final result. Config: { format: "json"|"text"|"markdown", template?: string, fields?: string[] }

WORKFLOW CREATION:
When a user asks to CREATE a workflow, you MUST generate a complete workflow with:
1. Unique node IDs (use format: node_1, node_2, etc.)
2. Complete configurations for every node
3. Edges connecting the nodes

HOW BIG (this is not optional):
Every workflow you create has AT LEAST 10 nodes. A three-node
input-then-ai-then-output workflow is not an acceptable answer to any request,
however simple the request sounds. One AI step that does everything is a worse
answer than six that each do one thing, because the person can read, edit and
trust each step on its own.

Reach 10+ by breaking the job into the questions a person would actually ask:
- ONE "input" node collecting everything needed up front
- FOUR OR MORE "ai" nodes, each asking ONE focused question about the same
  material, wired in PARALLEL from the input rather than in a chain. For a pile
  of reviews that is: the themes, the quiet signals, what it is costing, what to
  fix first, how to say it to the team.
- AT LEAST ONE "logic" node with operation "condition" testing a number the AI
  returned (for example "negativeCount > 3"), so the workflow reacts to what it
  found
- "logic" nodes with operation "transform" to rename a value for the step that
  needs it, and "map" or "reduce" where a list needs per-item work or totalling
- ONE final "ai" node that writes the thing the person actually wanted, fed by
  the earlier findings
- ONE "output" node with format "markdown" and a template that lays the whole
  result out under headings
- an "api" node where public data would genuinely help (api.github.com and
  hn.algolia.com need no key), and a "webhook" node when the result should be
  sent on

LAYOUT:
Lay the nodes out in columns, not one long row. x = 100 + 320 * column, and
y = 120 + 150 * row within that column. Parallel steps share a column and stack
down it. The input is the only node in column 0; the output is alone in the last.

DATA FLOW (get this wrong and the workflow fails at run time):
A step receives ONLY the merged output of the steps wired DIRECTLY into it. It
cannot see values from further back in the workflow. So if the output node needs
a value, the step producing it must be wired straight to the output node. It is
normal and correct for eight steps to all point at the output node.

{{name}} in any config refers to a key from a direct predecessor's output:
- an "ai" node produces exactly the properties named in its outputSchema
- a "logic" transform produces the keys named in its mappings
- a "logic" condition produces { result, branch, data }
- a "logic" map produces { data, count }, and per-item keys live inside data
- an "input" node produces its field names

For AI nodes, ALWAYS include a complete outputSchema with type, properties, and
required fields. Give every property a description. An array property MUST also
declare items, for example { "type": "array", "items": { "type": "string" } };
an array without items is rejected before the model is called.

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

${INTEGRATIONS_ENABLED ? "" : `APP CONNECTIONS ARE NOT AVAILABLE YET:
Connecting Flowys directly to other apps - Slack, Notion, GitHub, Airtable, Google
Sheets, SendGrid, Twilio, Discord, Gmail, Trello, Jira, or any other named product -
is still being built. There is no "integration" node available.

When someone asks for a workflow that sends to, reads from, or syncs with a named
app, you MUST:
1. Say plainly that connecting to that app is coming soon, in one short sentence.
2. NOT include "workflowGeneration" in your response for that app step.
3. Offer what does work instead: if the app has a public web address you can call,
   an "api" node can reach it with the person's own key; otherwise suggest building
   the rest of the workflow now and adding the app step once it is ready.
Never imply the connection already works, and never invent an integration node.
`}
IMPORTANT:
- Only include "workflowGeneration" when user asks to CREATE/BUILD/MAKE a workflow
- A workflowGeneration with fewer than 10 nodes is incomplete. Count them before answering.
- Only include "errorAnalysis" when there's an actual error
- Only include "suggestedFix" when suggesting a fix for an error
- For outputSchema in AI nodes, always include type:"object", properties with descriptions, and required array

Always respond with ONLY valid JSON.`;

/**
 * Strip any provider or model the assistant volunteered on an AI step.
 *
 * The prompt tells it not to emit these, but a stored provider/model would be
 * misleading in the saved workflow, the engine resolves the target itself.
 */
function normalizeAiModels(nodes: unknown[]): unknown[] {
  return nodes.map((node) => {
    const n = node as { type?: string; data?: { config?: Record<string, unknown> } };
    if (n?.type !== "ai" || !n.data?.config) return node;

    const { provider: _p, model: _m, ...rest } = n.data.config;
    return { ...n, data: { ...n.data, config: rest } };
  });
}

/**
 * A workflow worth putting on someone's canvas is more than three steps.
 *
 * The prompt asks for at least ten and says why, but a short request ("summarise
 * this") still tempts a short answer. Rather than hand over something the person
 * will immediately outgrow, ask once for the same workflow broken down properly.
 * One extra call, only when the first answer came back thin.
 */
const MIN_GENERATED_NODES = 10;

/**
 * The assistant's answer, as loosely as it actually arrives. Every field is
 * checked at the point of use rather than trusted here.
 */
interface FluxAnswer {
  message?: string;
  suggestions?: unknown;
  workflowGeneration?: {
    description?: string;
    nodes?: unknown[];
    edges?: unknown[];
  };
  errorAnalysis?: Record<string, unknown> & { hasError?: boolean };
  suggestedFix?: Record<string, unknown> & {
    explanation?: string;
    manualSteps?: unknown;
    autoFix?: Record<string, unknown> & { type?: string; description?: string };
  };
}

async function ensureWorkflowDepth(
  parsedContent: FluxAnswer,
  messages: OpenAI.ChatCompletionMessageParam[],
  rawAnswer: string
): Promise<FluxAnswer> {
  const nodeCount = parsedContent?.workflowGeneration?.nodes?.length ?? 0;

  if (nodeCount === 0 || nodeCount >= MIN_GENERATED_NODES) return parsedContent;

  try {
    const retry = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        ...messages,
        { role: "assistant", content: rawAnswer },
        {
          role: "user",
          content:
            `That workflow has only ${nodeCount} steps. Rebuild the same workflow ` +
            `with at least ${MIN_GENERATED_NODES}, by splitting the reading work into ` +
            "separate AI steps that each answer one question in parallel, adding a " +
            "condition on a number one of them returns, naming values with transform " +
            "steps, and finishing with a step that writes the result. Keep the same " +
            "goal and the same input fields. Reply with the full JSON again.",
        },
      ],
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    const expanded: FluxAnswer = JSON.parse(
      retry.choices[0]?.message?.content || "{}"
    );
    const expandedCount = expanded?.workflowGeneration?.nodes?.length ?? 0;

    // Only take the second answer if it is actually the fuller one.
    return expandedCount > nodeCount ? expanded : parsedContent;
  } catch {
    // A failed expansion is not a failed conversation, keep the first answer.
    return parsedContent;
  }
}

export async function GET() {
  return NextResponse.json({
    suggestions: [
      "Read a support email and tell me how urgent it is",
      "Turn a batch of reviews into what to fix first",
      "Pull the decisions and to-dos out of a meeting transcript",
      "Score an enquiry and draft the reply",
      "Summarise a long document into a few lines",
      "Look up a public GitHub project and brief me on it",
      "Something in my workflow isn't working",
      "Explain what my workflow does right now",
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
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    try {
      const parsedContent = await ensureWorkflowDepth(
        JSON.parse(content),
        messages,
        content
      );

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
        const generatedNodes = parsedContent.workflowGeneration.nodes as {
          type?: string;
        }[];

        // Backstop for the prompt guardrail: an integration node can't be
        // configured or run yet, so handing one back would put a dead step on the
        // user's canvas. Drop the whole suggestion and say why instead.
        const usesIntegrations =
          !INTEGRATIONS_ENABLED &&
          generatedNodes.some((node) => node?.type === "integration");

        if (usesIntegrations) {
          result.message =
            "Connecting Flowys straight to other apps is coming soon, so I can't build that part yet. " +
            "If the app has a web address I can call, an API step can reach it in the meantime, " +
            "or I can build the rest of the workflow now and you can add the app step later.";
          result.suggestions = [
            "Build the rest without the app step",
            "Use an API step instead",
            "What can I build today?",
          ];
        } else {
          result.workflowGeneration = {
            description:
              parsedContent.workflowGeneration.description || "Generated workflow",
            nodes: normalizeAiModels(generatedNodes),
            edges: parsedContent.workflowGeneration.edges || [],
          };
        }
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
