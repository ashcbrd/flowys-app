/**
 * Workflow Templates
 *
 * Ready-made workflows a user can run without building anything.
 *
 * Every template here runs on steps that need no app connections — questions,
 * AI steps, rules, and a result. That is deliberate: a template that requires
 * an account the user hasn't linked isn't a starting point, it's a dead end.
 *
 * These are the same shape the canvas already loads (`GeneratedWorkflow`), so
 * `createWorkflow()` in the store accepts them directly.
 */

import type { GeneratedWorkflow } from "@/store/workflow";

export interface WorkflowTemplate {
  id: string;
  /** What the user reads in the gallery. */
  name: string;
  /** One line on what it does for them. */
  description: string;
  /** Grouping label. */
  category: string;
  /** What they need to hand it, in plain language. */
  needs: string;
  workflow: GeneratedWorkflow;
}

const MODEL = "claude-opus-5";
const PROVIDER = "anthropic";

/** Keeps node/edge boilerplate out of each template. */
function ai(
  id: string,
  label: string,
  x: number,
  config: {
    systemPrompt: string;
    userPromptTemplate: string;
    properties: Record<string, { type: string; description: string }>;
    temperature?: number;
  }
) {
  return {
    id,
    type: "ai" as const,
    position: { x, y: 200 },
    data: {
      label,
      config: {
        provider: PROVIDER,
        model: MODEL,
        systemPrompt: config.systemPrompt,
        userPromptTemplate: config.userPromptTemplate,
        temperature: config.temperature ?? 0.3,
        maxTokens: 4096,
        outputSchema: {
          type: "object",
          properties: config.properties,
          required: Object.keys(config.properties),
        },
      },
    },
  };
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "feedback-triage",
    name: "Sort a piece of customer feedback",
    description:
      "Reads one piece of feedback and tells you what it's about, how urgent it is, and how you might reply.",
    category: "Customer feedback",
    needs: "The feedback text",
    workflow: {
      nodes: [
        {
          id: "node_1",
          type: "input",
          position: { x: 100, y: 200 },
          data: {
            label: "The feedback",
            config: {
              fields: [
                {
                  name: "feedback",
                  type: "string",
                  required: true,
                  label: "What did they say?",
                  description: "Paste the message, review, or email.",
                  placeholder: "The export button hasn't worked since Tuesday…",
                },
                {
                  name: "customerName",
                  type: "string",
                  label: "Who said it (optional)",
                  placeholder: "Sam at Acme",
                },
              ],
            },
          },
        },
        ai("node_2", "Work out what it means", 400, {
          systemPrompt:
            "You triage customer feedback for a small software team. Be specific and practical. Never invent details the feedback doesn't contain.",
          userPromptTemplate:
            "Feedback from {{customerName}}:\n\n{{feedback}}\n\nSort this feedback.",
          properties: {
            category: {
              type: "string",
              description:
                "One of: bug, feature request, pricing, usability, praise, other",
            },
            urgency: {
              type: "string",
              description: "One of: high, medium, low",
            },
            sentiment: {
              type: "string",
              description: "One of: angry, frustrated, neutral, happy",
            },
            summary: {
              type: "string",
              description: "One sentence on what they actually want",
            },
            suggestedReply: {
              type: "string",
              description: "A short, warm reply that addresses their point directly",
            },
          },
        }),
        {
          id: "node_3",
          type: "output",
          position: { x: 700, y: 200 },
          data: {
            label: "The result",
            config: {
              format: "markdown",
              template:
                "**{{category}}** · urgency **{{urgency}}** · they sound **{{sentiment}}**\n\n{{summary}}\n\n---\n\n**Suggested reply**\n\n{{suggestedReply}}",
            },
          },
        },
      ],
      edges: [
        { id: "edge_1", source: "node_1", target: "node_2" },
        { id: "edge_2", source: "node_2", target: "node_3" },
      ],
    },
  },

  {
    id: "review-themes",
    name: "Find the themes in a pile of reviews",
    description:
      "Upload a batch of reviews or survey answers and get the patterns back instead of reading all of them.",
    category: "Customer feedback",
    needs: "A file of reviews — a CSV export works well",
    workflow: {
      nodes: [
        {
          id: "node_1",
          type: "input",
          position: { x: 100, y: 200 },
          data: {
            label: "The reviews",
            config: {
              fields: [
                {
                  name: "reviews",
                  type: "file",
                  required: true,
                  label: "Upload your reviews",
                  description:
                    "A CSV export from your review or survey tool works well.",
                },
              ],
            },
          },
        },
        ai("node_2", "Find the patterns", 400, {
          systemPrompt:
            "You analyse customer feedback in bulk for a small software team. Ground every theme in what was actually written. Do not pad the list to hit a number.",
          userPromptTemplate:
            "Reviews:\n\n{{reviews}}\n\nFind the themes across all of these.",
          properties: {
            headline: {
              type: "string",
              description: "One sentence a founder could read and act on",
            },
            overallSentiment: {
              type: "string",
              description: "One of: mostly positive, mixed, mostly negative",
            },
            topComplaints: {
              type: "array",
              description: "The most common complaints, most frequent first",
            },
            topPraise: {
              type: "array",
              description: "What people consistently like",
            },
            quietSignals: {
              type: "array",
              description:
                "Things mentioned only once or twice that still look important",
            },
          },
        }),
        {
          id: "node_3",
          type: "output",
          position: { x: 700, y: 200 },
          data: {
            label: "The summary",
            config: {
              format: "markdown",
              template:
                "## {{headline}}\n\nOverall: **{{overallSentiment}}**\n\n### Complaints\n{{topComplaints}}\n\n### What they like\n{{topPraise}}\n\n### Worth a look\n{{quietSignals}}",
            },
          },
        },
      ],
      edges: [
        { id: "edge_1", source: "node_1", target: "node_2" },
        { id: "edge_2", source: "node_2", target: "node_3" },
      ],
    },
  },

  {
    id: "lead-qualify",
    name: "Decide whether a new enquiry is worth your time",
    description:
      "Scores an inbound message against what you're looking for, and only flags the ones worth replying to.",
    category: "Sales",
    needs: "The enquiry, and a line on who you want to work with",
    workflow: {
      nodes: [
        {
          id: "node_1",
          type: "input",
          position: { x: 100, y: 200 },
          data: {
            label: "The enquiry",
            config: {
              fields: [
                {
                  name: "enquiry",
                  type: "string",
                  required: true,
                  label: "What did they send?",
                  placeholder: "Hi, we're a 40-person agency looking for…",
                },
                {
                  name: "idealCustomer",
                  type: "string",
                  required: true,
                  label: "Who are you looking for?",
                  description: "Describe your ideal customer in a sentence.",
                  placeholder: "Software teams of 10-200 who already pay for tools",
                },
              ],
            },
          },
        },
        ai("node_2", "Score the fit", 400, {
          systemPrompt:
            "You qualify inbound sales enquiries. Be sceptical: score on evidence in the message, not on enthusiasm. A vague enquiry is a low score.",
          userPromptTemplate:
            "We are looking for: {{idealCustomer}}\n\nThe enquiry:\n\n{{enquiry}}\n\nScore this enquiry.",
          properties: {
            fitScore: {
              type: "number",
              description: "How well they match, 1 to 10",
            },
            intent: {
              type: "string",
              description: "One of: ready to buy, researching, just curious, unclear",
            },
            reasoning: {
              type: "string",
              description: "One sentence on why you scored it that way",
            },
            nextStep: {
              type: "string",
              description: "The single most useful thing to do next",
            },
          },
        }),
        {
          id: "node_3",
          type: "logic",
          position: { x: 700, y: 200 },
          data: {
            label: "Worth replying to?",
            config: {
              operation: "condition",
              condition: "fitScore >= 6",
            },
          },
        },
        {
          id: "node_4",
          type: "output",
          position: { x: 1000, y: 200 },
          data: {
            label: "The verdict",
            config: {
              format: "markdown",
              template:
                "Worth replying: **{{branch}}**\n\nScore {{data.fitScore}}/10 · {{data.intent}}\n\n{{data.reasoning}}\n\n**Next step:** {{data.nextStep}}",
            },
          },
        },
      ],
      edges: [
        { id: "edge_1", source: "node_1", target: "node_2" },
        { id: "edge_2", source: "node_2", target: "node_3" },
        { id: "edge_3", source: "node_3", target: "node_4" },
      ],
    },
  },

  {
    id: "email-to-ticket",
    name: "Turn a support email into a clean ticket",
    description:
      "Takes a rambling email and pulls out the title, the actual problem, and what the customer is asking for.",
    category: "Support",
    needs: "The email text",
    workflow: {
      nodes: [
        {
          id: "node_1",
          type: "input",
          position: { x: 100, y: 200 },
          data: {
            label: "The email",
            config: {
              fields: [
                {
                  name: "email",
                  type: "string",
                  required: true,
                  label: "Paste the email",
                  description: "Include the whole thing — signatures and all.",
                },
              ],
            },
          },
        },
        ai("node_2", "Pull out the details", 400, {
          systemPrompt:
            "You turn support emails into tickets. Separate what happened from what the customer wants. Ignore pleasantries and signatures. If something isn't stated, say 'not stated' rather than guessing.",
          userPromptTemplate: "Email:\n\n{{email}}\n\nTurn this into a ticket.",
          properties: {
            title: {
              type: "string",
              description: "A short title someone could scan in a list",
            },
            problem: {
              type: "string",
              description: "What is actually going wrong, in plain terms",
            },
            askedFor: {
              type: "string",
              description: "What the customer wants to happen",
            },
            priority: {
              type: "string",
              description: "One of: urgent, normal, low",
            },
            missingInfo: {
              type: "array",
              description: "What you'd need to ask them before you can fix it",
            },
          },
        }),
        {
          id: "node_3",
          type: "output",
          position: { x: 700, y: 200 },
          data: {
            label: "The ticket",
            config: {
              format: "markdown",
              template:
                "## {{title}}\n\n**Priority:** {{priority}}\n\n**Problem**\n{{problem}}\n\n**They want**\n{{askedFor}}\n\n**Still need to ask**\n{{missingInfo}}",
            },
          },
        },
      ],
      edges: [
        { id: "edge_1", source: "node_1", target: "node_2" },
        { id: "edge_2", source: "node_2", target: "node_3" },
      ],
    },
  },

  {
    id: "weekly-digest",
    name: "Write this week's feedback digest",
    description:
      "Turns a week of collected notes into a short digest you can paste into a team update. Put it on a schedule and it writes itself.",
    category: "Customer feedback",
    needs: "This week's notes, pasted in",
    workflow: {
      nodes: [
        {
          id: "node_1",
          type: "input",
          position: { x: 100, y: 200 },
          data: {
            label: "This week",
            config: {
              fields: [
                {
                  name: "notes",
                  type: "string",
                  required: true,
                  label: "What came in this week?",
                  description: "Paste everything. Rough notes are fine.",
                },
                {
                  name: "weekOf",
                  type: "string",
                  label: "Week of",
                  placeholder: "3 March",
                },
              ],
            },
          },
        },
        ai("node_2", "Write the digest", 400, {
          temperature: 0.5,
          systemPrompt:
            "You write short internal digests for a small software team. Lead with what changed or what needs a decision. No filler, no restating the obvious. If the week was quiet, say so in one line rather than padding.",
          userPromptTemplate:
            "Week of {{weekOf}}. Notes:\n\n{{notes}}\n\nWrite the digest.",
          properties: {
            period: {
              type: "string",
              description:
                "The period this digest covers, e.g. \"week of 3 March\". Use what you were given.",
            },
            headline: {
              type: "string",
              description: "The one thing the team should know",
            },
            decisionsNeeded: {
              type: "array",
              description: "Anything waiting on a human decision",
            },
            trends: {
              type: "string",
              description: "Two or three sentences on what's shifting",
            },
            quoteOfTheWeek: {
              type: "string",
              description: "The most useful thing a customer actually said, verbatim",
            },
          },
        }),
        {
          id: "node_3",
          type: "output",
          position: { x: 700, y: 200 },
          data: {
            label: "The digest",
            config: {
              format: "markdown",
              template:
                "# Feedback digest — {{period}}\n\n**{{headline}}**\n\n{{trends}}\n\n### Needs a decision\n{{decisionsNeeded}}\n\n> {{quoteOfTheWeek}}",
            },
          },
        },
      ],
      edges: [
        { id: "edge_1", source: "node_1", target: "node_2" },
        { id: "edge_2", source: "node_2", target: "node_3" },
      ],
    },
  },
];

export function templatesByCategory(): [string, WorkflowTemplate[]][] {
  const map = new Map<string, WorkflowTemplate[]>();
  for (const template of TEMPLATES) {
    const list = map.get(template.category) || [];
    list.push(template);
    map.set(template.category, list);
  }
  return [...map.entries()];
}
