/**
 * Workflow Templates
 *
 * Ready-made workflows a user can run without building anything.
 *
 * Every template runs on steps that need no app connections and no
 * user-specific URLs, questions, AI steps, rules, and a result. A template that
 * needed an account the user hasn't linked, or a web address only they know,
 * isn't a starting point; it's a dead end.
 *
 * These are the same shape the canvas already loads (`GeneratedWorkflow`), so
 * `createWorkflow()` in the store accepts them directly.
 *
 * Two engine rules shape every graph here, and tests enforce both:
 *
 *   1. A step receives the merged output of its DIRECT predecessors only, not
 *      everything produced upstream. Carrying a value three steps forward means
 *      wiring an edge to it, or restating it.
 *   2. Fan-in merges by key, so two steps feeding one node must not emit the same
 *      name. A `condition` step always emits `result`/`branch`/`data`, so each one
 *      is followed by a `transform` that renames its verdict to something unique.
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

type Cfg = Record<string, unknown>;

/** Column/row layout, so a wide graph is readable on the canvas. */
const COL = 320;
const ROW = 190;

function at(col: number, row: number) {
  return { x: 80 + col * COL, y: 80 + row * ROW };
}

function ask(id: string, label: string, col: number, row: number, fields: Cfg[]) {
  return {
    id,
    type: "input" as const,
    position: at(col, row),
    data: { label, config: { fields } },
  };
}

function think(
  id: string,
  label: string,
  col: number,
  row: number,
  opts: {
    system?: string;
    prompt: string;
    gives: Record<string, { type: string; description: string }>;
    temperature?: number;
  }
) {
  return {
    id,
    type: "ai" as const,
    position: at(col, row),
    data: {
      label,
      config: {
        // No provider or model, the engine resolves which AI to use.
        systemPrompt: opts.system,
        userPromptTemplate: opts.prompt,
        temperature: opts.temperature ?? 0.3,
        maxTokens: 2048,
        outputSchema: {
          type: "object",
          properties: opts.gives,
          required: Object.keys(opts.gives),
        },
      },
    },
  };
}

function rule(id: string, label: string, col: number, row: number, condition: string) {
  return {
    id,
    type: "logic" as const,
    position: at(col, row),
    data: { label, config: { operation: "condition", condition } },
  };
}

function rename(
  id: string,
  label: string,
  col: number,
  row: number,
  mappings: Record<string, string>
) {
  return {
    id,
    type: "logic" as const,
    position: at(col, row),
    data: { label, config: { operation: "transform", mappings } },
  };
}

function result(id: string, label: string, col: number, row: number, template: string) {
  return {
    id,
    type: "output" as const,
    position: at(col, row),
    data: { label, config: { format: "markdown", template } },
  };
}

/**
 * Reads from a service on the web.
 *
 * Templates only ever point at services that are free and need no key, so a
 * template works the moment it lands on the canvas. A template that asked for an
 * account first would not be a starting point.
 */
function fetchFrom(
  id: string,
  label: string,
  col: number,
  row: number,
  opts: { url: string; gives?: Record<string, string> }
) {
  return {
    id,
    type: "api" as const,
    position: at(col, row),
    data: {
      label,
      config: {
        url: opts.url,
        method: "GET",
        // Some services reject a request with no caller name.
        headers: { "User-Agent": "Flowys" },
        // Omit for a list response: the step already hands on `data` and `count`.
        ...(opts.gives ? { responseMapping: opts.gives } : {}),
      },
    },
  };
}

/** `wire("a>b", "b>c")`, keeps a wide graph's edges legible. */
function wire(...pairs: string[]) {
  return pairs.map((pair, i) => {
    const [source, target] = pair.split(">");
    return { id: `edge_${i + 1}`, source, target };
  });
}

// ---------------------------------------------------------------------------

export const SUPPORT_TRIAGE: WorkflowTemplate = {
  id: "support-triage",
  name: "Triage a support email, end to end",
  description:
    "13 steps. Reads one support email and returns a clean ticket, an urgency call, likely causes, a draft reply, and a note for whoever picks it up.",
  category: "Support",
  needs: "The email text, and who sent it",
  workflow: {
    nodes: [
      ask("n1", "The email", 0, 1, [
        {
          name: "emailText",
          type: "string",
          required: true,
          label: "Paste the email",
          description: "Include the whole thing, signature and all.",
          multiline: true,
        },
        { name: "customerName", type: "string", label: "Who sent it", placeholder: "Priya at Acme" },
        {
          name: "plan",
          type: "string",
          label: "What plan are they on?",
          placeholder: "Pro",
          default: "unknown",
        },
      ]),

      think("n2", "Understand the request", 1, 1, {
        system:
          "You turn support emails into tickets. Separate what happened from what the customer wants. Ignore pleasantries and signatures. If something isn't stated, say 'not stated' rather than guessing.",
        prompt:
          "Email from {{customerName}} (plan: {{plan}}):\n\n{{emailText}}\n\nTurn this into a ticket.",
        gives: {
          title: { type: "string", description: "A short title someone could scan in a list" },
          problem: { type: "string", description: "What is actually going wrong, in plain terms" },
          askedFor: { type: "string", description: "What the customer wants to happen" },
          priority: { type: "string", description: "One of: urgent, normal, low" },
          sentiment: { type: "string", description: "One of: angry, frustrated, neutral, happy" },
          productArea: { type: "string", description: "Which part of the product this concerns" },
        },
      }),

      think("n3", "Judge how urgent it is", 2, 0, {
        system:
          "You assess urgency for a small software team. Score on the business impact stated in the ticket, not on how forcefully it was written.",
        prompt:
          "Title: {{title}}\nProblem: {{problem}}\nThey want: {{askedFor}}\nStated priority: {{priority}}\n\nScore the urgency.",
        gives: {
          urgencyScore: { type: "number", description: "1 to 10, where 10 means drop everything" },
          urgencyReason: { type: "string", description: "One sentence on why" },
        },
      }),

      rule("n4", "Escalate?", 3, 0, "urgencyScore >= 7"),

      rename("n5", "Note the escalation", 4, 0, {
        escalate: "branch",
        urgencyDetail: "data.urgencyReason",
        urgencyNumber: "data.urgencyScore",
      }),

      rule("n6", "At risk of leaving?", 2, 2, "sentiment === 'angry'"),

      rename("n7", "Note the risk", 3, 2, { churnRisk: "branch" }),

      think("n8", "Work out likely causes", 2, 3, {
        system:
          "You are a senior engineer triaging a report. Offer causes that fit the evidence given. Do not speculate beyond what the ticket says.",
        prompt:
          "Problem: {{problem}}\nArea: {{productArea}}\n\nWhat is most likely causing this, and what would you check first?",
        gives: {
          hypotheses: { type: "array", description: "Likely causes, most probable first" },
          nextChecks: { type: "array", description: "What to check, in order" },
        },
      }),

      think("n9", "Draft a reply", 1, 4, {
        temperature: 0.5,
        system:
          "You write support replies for a small software team. Warm, direct, no corporate filler. Address the specific problem. Never promise a date.",
        prompt: "Customer: {{customerName}}\nThey said: {{emailText}}\n\nWrite a short reply.",
        gives: {
          replyDraft: { type: "string", description: "The reply, ready to send" },
          replyTone: { type: "string", description: "One of: apologetic, neutral, upbeat" },
        },
      }),

      think("n10", "Write the internal note", 3, 3, {
        system:
          "You write short internal notes for engineers picking up a ticket. Lead with what to look at.",
        prompt:
          "Likely causes: {{hypotheses}}\nWhat to check: {{nextChecks}}\n\nWrite a two-sentence note for whoever picks this up.",
        gives: {
          internalNote: { type: "string", description: "Two sentences, engineer to engineer" },
        },
      }),

      think("n11", "File it", 2, 5, {
        system: "You label support tickets consistently. Use short, reusable labels.",
        prompt: "Title: {{title}}\nArea: {{productArea}}\n\nGive this a category.",
        gives: {
          category: { type: "string", description: "A broad category, e.g. Reliability" },
          subCategory: { type: "string", description: "A narrower label, e.g. Export" },
        },
      }),

      rename("n12", "Gather the ticket", 2, 1, {
        ticketTitle: "title",
        ticketProblem: "problem",
        ticketAsk: "askedFor",
        ticketPriority: "priority",
        ticketArea: "productArea",
      }),

      result(
        "n13",
        "The handover",
        5,
        2,
        [
          "# {{ticketTitle}}",
          "",
          "**{{category}} / {{subCategory}}** · priority **{{ticketPriority}}** · area **{{ticketArea}}**",
          "",
          "Escalate: **{{escalate}}** · urgency **{{urgencyNumber}}/10** · at risk of leaving: **{{churnRisk}}**",
          "",
          "{{urgencyDetail}}",
          "",
          "## The problem",
          "{{ticketProblem}}",
          "",
          "## What they want",
          "{{ticketAsk}}",
          "",
          "## Likely causes",
          "{{hypotheses}}",
          "",
          "## Check these first",
          "{{nextChecks}}",
          "",
          "## Note for whoever picks this up",
          "{{internalNote}}",
          "",
          "---",
          "",
          "## Draft reply ({{replyTone}})",
          "",
          "{{replyDraft}}",
        ].join("\n")
      ),
    ],
    edges: wire(
      "n1>n2",
      "n2>n3",
      "n3>n4",
      "n4>n5",
      "n2>n6",
      "n6>n7",
      "n2>n8",
      "n1>n9",
      "n8>n10",
      "n2>n11",
      "n2>n12",
      "n5>n13",
      "n7>n13",
      "n8>n13",
      "n9>n13",
      "n10>n13",
      "n11>n13",
      "n12>n13",
    ),
  },
};

// ---------------------------------------------------------------------------

const LEAD_QUALIFY: WorkflowTemplate = {
  id: "lead-qualify",
  name: "Qualify an enquiry and draft both replies",
  description:
    "13 steps. Scores an enquiry against who you want to work with, flags the risks, and drafts the reply for either answer so you just pick one.",
  category: "Sales",
  needs: "The enquiry, and a line on your ideal customer",
  workflow: {
    nodes: [
      ask("n1", "The enquiry", 0, 1, [
        {
          name: "enquiry",
          type: "string",
          required: true,
          label: "What did they send?",
          placeholder: "Hi, we're a 40-person agency and budget is approved…",
          multiline: true,
        },
        {
          name: "idealCustomer",
          type: "string",
          required: true,
          label: "Who do you want to work with?",
          description: "One sentence is enough.",
          multiline: true,
          placeholder: "Software teams of 10-200 who already pay for tools",
        },
        {
          name: "yourOffer",
          type: "string",
          label: "What are you selling?",
          placeholder: "Workflow automation, £99/month",
          default: "our product",
        },
      ]),

      think("n2", "Pull out the facts", 1, 1, {
        system:
          "You extract facts from sales enquiries. Only record what is stated. Use 'not stated' rather than inferring.",
        prompt: "Enquiry:\n\n{{enquiry}}\n\nExtract the facts.",
        gives: {
          companySize: { type: "string", description: "Team or company size, or 'not stated'" },
          budgetSignal: { type: "string", description: "Any sign of budget, or 'not stated'" },
          timeline: { type: "string", description: "When they want to start, or 'not stated'" },
          statedNeed: { type: "string", description: "What they say they need" },
          decisionMaker: {
            type: "string",
            description: "Whether the sender can decide, or 'not stated'",
          },
        },
      }),

      think("n3", "Score the fit", 2, 0, {
        system:
          "You qualify inbound enquiries sceptically. Score on evidence, not enthusiasm. A vague enquiry scores low however keen it sounds.",
        prompt:
          "We want: {{idealCustomer}}\n\nSize: {{companySize}}\nBudget: {{budgetSignal}}\nTimeline: {{timeline}}\nNeed: {{statedNeed}}\nCan decide: {{decisionMaker}}\n\nScore the fit.",
        gives: {
          fitScore: { type: "number", description: "1 to 10" },
          fitReason: { type: "string", description: "One sentence on why" },
          intent: {
            type: "string",
            description: "One of: ready to buy, researching, just curious, unclear",
          },
        },
      }),

      rule("n4", "Worth your time?", 3, 0, "fitScore >= 6"),

      rename("n5", "Note the verdict", 4, 0, {
        worthReplying: "branch",
        score: "data.fitScore",
        scoreReason: "data.fitReason",
        buyingIntent: "data.intent",
      }),

      think("n6", "Spot the risks", 2, 2, {
        system: "You flag what could go wrong in a deal, based only on the enquiry. Be concrete.",
        prompt:
          "Size: {{companySize}}\nBudget: {{budgetSignal}}\nTimeline: {{timeline}}\nNeed: {{statedNeed}}\n\nWhat could go wrong here, and what should we ask?",
        gives: {
          risks: { type: "array", description: "Concrete risks, most likely first" },
          questionsToAsk: { type: "array", description: "What to ask before committing time" },
        },
      }),

      rule("n7", "Enterprise-sized?", 2, 3, "companySize contains '00'"),

      rename("n8", "Note the size", 3, 3, { looksEnterprise: "branch" }),

      think("n9", "Draft a keen reply", 1, 4, {
        temperature: 0.5,
        system:
          "You write short sales replies. Specific, warm, one clear next step. No corporate filler, no exclamation marks.",
        prompt:
          "They sent:\n\n{{enquiry}}\n\nWe sell: {{yourOffer}}\n\nWrite a reply that moves this forward.",
        gives: { keenReply: { type: "string", description: "The reply, ready to send" } },
      }),

      think("n10", "Draft a polite pass", 1, 5, {
        temperature: 0.5,
        system:
          "You write short, kind declines that leave the door open. Never invent a reason. Do not apologise twice.",
        prompt:
          "They sent:\n\n{{enquiry}}\n\nWrite a brief, friendly reply explaining we may not be the right fit right now.",
        gives: { passReply: { type: "string", description: "The decline, ready to send" } },
      }),

      think("n11", "Suggest the next move", 3, 2, {
        system: "You advise on the single most useful next action. One action only.",
        prompt:
          "Risks: {{risks}}\nQuestions: {{questionsToAsk}}\n\nWhat is the single best next step?",
        gives: { nextStep: { type: "string", description: "One concrete action" } },
      }),

      rename("n12", "Gather the facts", 2, 1, {
        theirSize: "companySize",
        theirBudget: "budgetSignal",
        theirTimeline: "timeline",
        theirNeed: "statedNeed",
      }),

      result(
        "n13",
        "The verdict",
        5,
        2,
        [
          "# Enquiry scored {{score}}/10",
          "",
          "Worth replying: **{{worthReplying}}** · intent **{{buyingIntent}}** · enterprise-sized: **{{looksEnterprise}}**",
          "",
          "{{scoreReason}}",
          "",
          "| | |",
          "| --- | --- |",
          "| Size | {{theirSize}} |",
          "| Budget | {{theirBudget}} |",
          "| Timeline | {{theirTimeline}} |",
          "| Need | {{theirNeed}} |",
          "",
          "## Risks",
          "{{risks}}",
          "",
          "## Ask them",
          "{{questionsToAsk}}",
          "",
          "**Next step:** {{nextStep}}",
          "",
          "---",
          "",
          "## If you're keen",
          "",
          "{{keenReply}}",
          "",
          "## If you're passing",
          "",
          "{{passReply}}",
        ].join("\n")
      ),
    ],
    edges: wire(
      "n1>n2",
      "n2>n3",
      "n1>n3",
      "n3>n4",
      "n4>n5",
      "n2>n6",
      "n2>n7",
      "n7>n8",
      "n1>n9",
      "n1>n10",
      "n6>n11",
      "n2>n12",
      "n5>n13",
      "n6>n13",
      "n8>n13",
      "n9>n13",
      "n10>n13",
      "n11>n13",
      "n12>n13",
    ),
  },
};

// ---------------------------------------------------------------------------

const MEETING_NOTES: WorkflowTemplate = {
  id: "meeting-actions",
  name: "Turn a meeting recording into decisions and actions",
  description:
    "14 steps. Takes a transcript and pulls out what was decided, who owes what, what's still open, and the risks, then drafts the follow-up message.",
  category: "Meetings",
  needs: "A transcript file, a .txt export from your recorder works",
  workflow: {
    nodes: [
      ask("n1", "The meeting", 0, 2, [
        {
          name: "transcript",
          type: "file",
          required: true,
          label: "Upload the transcript",
          description: "A .txt or .md export from your recorder works well.",
        },
        {
          name: "attendees",
          type: "string",
          label: "Who was there?",
          placeholder: "Sam, Priya, Alex",
          default: "the team",
        },
        {
          name: "meetingName",
          type: "string",
          label: "What was the meeting?",
          placeholder: "Q2 planning",
          default: "the meeting",
        },
      ]),

      think("n2", "Find what was decided", 1, 0, {
        system:
          "You extract decisions from meeting transcripts. A decision is something settled, not something discussed. If nothing was settled, say so plainly.",
        prompt:
          "Transcript of {{meetingName}} with {{attendees}}:\n\n{{transcript}}\n\nWhat was actually decided?",
        gives: {
          decisions: { type: "array", description: "What was settled, one per item" },
          decisionCount: { type: "number", description: "How many decisions were made" },
        },
      }),

      think("n3", "Find the actions", 1, 2, {
        system:
          "You extract action items from transcripts. Each action names an owner where one was stated, or says 'unassigned'. Never invent owners.",
        prompt: "Transcript:\n\n{{transcript}}\n\nList the actions, each with its owner.",
        gives: {
          actions: { type: "array", description: "Each as 'Owner, action'" },
          unassignedCount: { type: "number", description: "How many actions have no owner" },
        },
      }),

      think("n4", "Find what's still open", 1, 3, {
        system:
          "You spot unresolved threads in meetings, questions asked but not answered, topics deferred.",
        prompt: "Transcript:\n\n{{transcript}}\n\nWhat was left unresolved?",
        gives: {
          openQuestions: { type: "array", description: "Questions raised but not answered" },
          deferred: { type: "array", description: "Topics explicitly pushed to later" },
        },
      }),

      think("n5", "Spot the risks", 1, 5, {
        system:
          "You flag risks a manager would want to know about, grounded in what was said. No generic project-management advice.",
        prompt: "Transcript:\n\n{{transcript}}\n\nWhat should someone be worried about?",
        gives: {
          risks: { type: "array", description: "Concrete risks, most serious first" },
          watchClosely: { type: "string", description: "The one thing to watch" },
        },
      }),

      rule("n6", "Anything left unowned?", 2, 2, "unassignedCount > 0"),

      rename("n7", "Note the gap", 3, 2, {
        hasUnowned: "branch",
        unownedTally: "data.unassignedCount",
      }),

      rule("n8", "Did anything get settled?", 2, 0, "decisionCount > 0"),

      rename("n9", "Note the outcome", 3, 0, { anyDecisions: "branch" }),

      think("n10", "Write the opening", 2, 5, {
        system:
          "You write the opening paragraph of a meeting summary. Lead with the outcome. Three sentences at most.",
        prompt:
          "Decisions: {{decisions}}\n\nWrite the opening of a summary for people who weren't there.",
        gives: { summary: { type: "string", description: "Three sentences at most" } },
      }),

      think("n11", "Draft the follow-up", 2, 3, {
        temperature: 0.5,
        system:
          "You write follow-up messages after meetings. Short, scannable, ends with who owes what. No preamble.",
        prompt:
          "Actions:\n{{actions}}\n\nOpen questions:\n{{openQuestions}}\n\nWrite a follow-up message to the group.",
        gives: {
          followUpMessage: { type: "string", description: "The message, ready to send" },
        },
      }),

      think("n12", "Suggest the next agenda", 2, 4, {
        system:
          "You propose what a follow-up meeting should cover, based only on what was left open. If none is needed, say so in one item.",
        prompt:
          "Unresolved: {{openQuestions}}\nDeferred: {{deferred}}\n\nWhat should the next meeting cover?",
        gives: {
          nextAgenda: {
            type: "array",
            description: "Agenda items, or a single item saying none is needed",
          },
        },
      }),

      rename("n13", "Gather the actions", 2, 1, { actionList: "actions" }),

      result(
        "n14",
        "The write-up",
        4,
        2,
        [
          "# Meeting write-up",
          "",
          "{{summary}}",
          "",
          "Decisions: **{{decisionCount}}**. Actions without an owner: **{{unownedTally}}**.",
          "",
          "## Decided",
          "{{decisions}}",
          "",
          "## Actions",
          "{{actionList}}",
          "",
          "## Still open",
          "{{openQuestions}}",
          "",
          "## Pushed to later",
          "{{deferred}}",
          "",
          "## Risks",
          "{{risks}}",
          "",
          "**Watch closely:** {{watchClosely}}",
          "",
          "## Suggested next agenda",
          "{{nextAgenda}}",
          "",
          "---",
          "",
          "## Follow-up message",
          "",
          "{{followUpMessage}}",
        ].join("\n")
      ),
    ],
    edges: wire(
      "n1>n2",
      "n1>n3",
      "n1>n4",
      "n1>n5",
      "n3>n6",
      "n6>n7",
      "n2>n8",
      "n8>n9",
      "n2>n10",
      "n3>n11",
      "n4>n11",
      "n4>n12",
      "n3>n13",
      "n2>n14",
      "n4>n14",
      "n5>n14",
      "n7>n14",
      "n9>n14",
      "n10>n14",
      "n11>n14",
      "n12>n14",
      "n13>n14",
    ),
  },
};

// ---------------------------------------------------------------------------

const REVIEW_THEMES: WorkflowTemplate = {
  id: "review-themes",
  name: "Turn a pile of reviews into a decision",
  description:
    "10 steps. Reads a batch of reviews, finds the themes and the quiet signals, works out what's costing you customers, and says what to fix first.",
  category: "Customer feedback",
  needs: "A file of reviews, a CSV export works well",
  workflow: {
    nodes: [
      ask("n1", "The reviews", 0, 1, [
        {
          name: "reviews",
          type: "file",
          required: true,
          label: "Upload your reviews",
          description: "A CSV export from your review or survey tool works well.",
        },
        {
          name: "productName",
          type: "string",
          label: "What's it about?",
          placeholder: "the mobile app",
          default: "the product",
        },
      ]),

      think("n2", "Find the themes", 1, 0, {
        system:
          "You analyse customer feedback in bulk. Ground every theme in what was written. Never pad a list to reach a number.",
        prompt:
          "Reviews of {{productName}}:\n\n{{reviews}}\n\nFind the themes across all of these.",
        gives: {
          headline: { type: "string", description: "One sentence a founder could act on" },
          overallSentiment: {
            type: "string",
            description: "One of: mostly positive, mixed, mostly negative",
          },
          complaints: {
            type: "array",
            description: "Most common complaints, most frequent first",
          },
          praise: { type: "array", description: "What people consistently like" },
          negativeShare: {
            type: "number",
            description: "Rough percentage of reviews that are negative, 0 to 100",
          },
        },
      }),

      think("n3", "Find the quiet signals", 1, 2, {
        system:
          "You spot feedback mentioned only once or twice that still matters, early warnings, not noise.",
        prompt: "Reviews:\n\n{{reviews}}\n\nWhat was mentioned rarely but looks important?",
        gives: {
          quietSignals: { type: "array", description: "Rare but notable mentions" },
          bestQuote: {
            type: "string",
            description: "The most useful thing a customer said, verbatim",
          },
        },
      }),

      rule("n4", "Mostly unhappy?", 2, 0, "negativeShare >= 40"),

      rename("n5", "Note the mood", 3, 0, {
        mostlyUnhappy: "branch",
        negativePercent: "data.negativeShare",
      }),

      think("n6", "Work out what it's costing", 2, 1, {
        system:
          "You link customer complaints to business impact. Be concrete about which complaints drive people away, and say when you cannot tell.",
        prompt:
          "Complaints: {{complaints}}\nPraise: {{praise}}\n\nWhich of these is most likely to lose customers, and why?",
        gives: {
          biggestRisk: {
            type: "string",
            description: "The complaint most likely to lose customers",
          },
          riskReason: { type: "string", description: "Why, in one sentence" },
        },
      }),

      think("n7", "Decide what to fix first", 3, 1, {
        system:
          "You prioritise ruthlessly for a small team. One thing first. Say what to deliberately not do yet.",
        prompt:
          "Biggest risk: {{biggestRisk}}\nWhy: {{riskReason}}\n\nWhat should the team fix first, and what should wait?",
        gives: {
          fixFirst: { type: "string", description: "The single thing to do first" },
          fixNext: { type: "array", description: "What comes after, in order" },
          notYet: { type: "string", description: "What to deliberately leave alone for now" },
        },
      }),

      think("n8", "Draft the team update", 2, 3, {
        temperature: 0.5,
        system:
          "You write short internal updates. Lead with what changed. No filler, no restating the obvious.",
        prompt:
          "Rare signals: {{quietSignals}}\nA customer said: {{bestQuote}}\n\nWrite two sentences for a team update.",
        gives: { teamUpdate: { type: "string", description: "Two sentences" } },
      }),

      rename("n9", "Gather the themes", 2, 2, {
        themeHeadline: "headline",
        mood: "overallSentiment",
        topComplaints: "complaints",
        topPraise: "praise",
      }),

      result(
        "n10",
        "The read-out",
        4,
        1,
        [
          "# {{themeHeadline}}",
          "",
          "Overall **{{mood}}** · roughly **{{negativePercent}}%** negative · mostly unhappy: **{{mostlyUnhappy}}**",
          "",
          "## Complaints",
          "{{topComplaints}}",
          "",
          "## What they like",
          "{{topPraise}}",
          "",
          "## Worth a closer look",
          "{{quietSignals}}",
          "",
          "> {{bestQuote}}",
          "",
          "---",
          "",
          "## Biggest risk",
          "**{{biggestRisk}}**, {{riskReason}}",
          "",
          "## Fix this first",
          "**{{fixFirst}}**",
          "",
          "Then:",
          "{{fixNext}}",
          "",
          "Leave alone for now: {{notYet}}",
          "",
          "---",
          "",
          "## For the team update",
          "",
          "{{teamUpdate}}",
        ].join("\n")
      ),
    ],
    edges: wire(
      "n1>n2",
      "n1>n3",
      "n2>n4",
      "n4>n5",
      "n2>n6",
      "n6>n7",
      "n3>n8",
      "n2>n9",
      "n6>n10",
      "n3>n10",
      "n5>n10",
      "n7>n10",
      "n8>n10",
      "n9>n10",
    ),
  },
};

// ---------------------------------------------------------------------------

const GITHUB_BRIEF: WorkflowTemplate = {
  id: "github-brief",
  name: "Brief me on a GitHub project",
  description:
    "13 steps. Paste any public GitHub link, and it looks the project up, reads its open issues, and tells you what it does, how healthy it looks, and whether it is worth adopting.",
  category: "Research",
  needs: "The link to any public GitHub project",
  workflow: {
    nodes: [
      ask("n1", "Which project?", 0, 1, [
        {
          name: "repoLink",
          type: "string",
          required: true,
          label: "The project's link",
          description:
            "Copy the address from your browser and drop it in here. Something like owner/name works too.",
          placeholder: "https://github.com/facebook/react",
        },
      ]),

      think("n0", "Read the address", 1, 1, {
        system:
          "You read a GitHub project address and name its two parts. Accept a full link, an owner/name pair, or a link with extras like .git, a trailing slash, or a path into the project. The owner is the user or organisation; the project is the repository name without .git.",
        prompt: "The address: {{repoLink}}\n\nName its parts.",
        temperature: 0,
        gives: {
          owner: { type: "string", description: "The user or organisation from the address" },
          repo: { type: "string", description: "The project name from the address, without .git" },
        },
      }),

      fetchFrom("n2", "Look up the project", 1, 0, {
        url: "https://api.github.com/repos/{{owner}}/{{repo}}",
        gives: {
          projectName: "full_name",
          blurb: "description",
          stars: "stargazers_count",
          forks: "forks_count",
          openIssues: "open_issues_count",
          language: "language",
          link: "html_url",
          lastPush: "pushed_at",
        },
      }),

      fetchFrom("n3", "Read the open issues", 1, 2, {
        url: "https://api.github.com/repos/{{owner}}/{{repo}}/issues?state=open&per_page=15",
      }),

      think("n4", "Explain what it is", 2, 0, {
        system:
          "You explain software projects to someone deciding whether to use one. Plain language, no jargon. Say when the description does not tell you enough.",
        prompt:
          "Project: {{projectName}}\nDescription: {{blurb}}\nWritten in: {{language}}\nStars: {{stars}}\n\nExplain what this is and who it is for.",
        gives: {
          summary: { type: "string", description: "Two sentences on what it does" },
          audience: { type: "string", description: "Who would get value from it" },
        },
      }),

      rule("n5", "Lots of open issues?", 2, 1, "openIssues > 200"),

      rename("n6", "Note the health", 3, 1, {
        manyOpenIssues: "branch",
        issueTally: "data.openIssues",
        starTally: "data.stars",
        forkTally: "data.forks",
        projectLink: "data.link",
        lastUpdated: "data.lastPush",
      }),

      {
        id: "n7",
        type: "logic" as const,
        position: at(2, 2),
        data: {
          label: "Just the issue titles",
          config: {
            operation: "map",
            mappings: { heading: "item.title", chatter: "item.comments" },
          },
        },
      },

      {
        id: "n8",
        type: "logic" as const,
        position: at(3, 3),
        data: {
          label: "Add up the comments",
          config: { operation: "reduce", expression: "sum:chatter" },
        },
      },

      rename("n9", "Note the chatter", 4, 3, { totalComments: "result" }),

      think("n10", "Find the themes", 3, 2, {
        system:
          "You read a list of open issue titles and report what people are actually struggling with. Ground every theme in the titles given.",
        prompt:
          "Open issues:\n\n{{data}}\n\nWhat are the recurring themes?",
        gives: {
          themes: { type: "array", description: "Recurring themes, most common first" },
          worstProblem: { type: "string", description: "The single most concerning one" },
        },
      }),

      think("n11", "Say whether to adopt it", 4, 1, {
        system:
          "You advise on whether to adopt a project. Weigh activity and popularity against unresolved problems. Be decisive and say what would change your mind.",
        prompt:
          "What it is: {{summary}}\nFor: {{audience}}\n\nStars: {{starTally}} · forks: {{forkTally}} · open issues: {{issueTally}} · many open issues: {{manyOpenIssues}}\nLast updated: {{lastUpdated}}\n\nWould you adopt this?",
        gives: {
          verdict: { type: "string", description: "One of: yes, probably, be careful, no" },
          reasoning: { type: "string", description: "Two sentences on why" },
          watchFor: { type: "string", description: "The one thing to keep an eye on" },
        },
      }),

      result(
        "n12",
        "The brief",
        5,
        1,
        [
          "# {{verdict}}",
          "",
          "{{reasoning}}",
          "",
          "**Watch for:** {{watchFor}}",
          "",
          "## What it is",
          "{{summary}}",
          "",
          "Built for {{audience}}.",
          "",
          "## Health",
          "",
          "| | |",
          "| --- | --- |",
          "| Stars | {{starTally}} |",
          "| Forks | {{forkTally}} |",
          "| Open issues | {{issueTally}} |",
          "| Unusually busy | {{manyOpenIssues}} |",
          "| Comments on open issues | {{totalComments}} |",
          "| Last updated | {{lastUpdated}} |",
          "",
          "## What people are struggling with",
          "{{themes}}",
          "",
          "Biggest concern: {{worstProblem}}",
          "",
          "[View the project]({{projectLink}})",
        ].join("\n")
      ),

    ],
    edges: wire(
      "n1>n0",
      "n0>n2",
      "n0>n3",
      "n2>n4",
      "n2>n5",
      "n5>n6",
      "n3>n7",
      "n7>n8",
      "n8>n9",
      "n7>n10",
      "n4>n11",
      "n6>n11",
      "n4>n12",
      "n6>n12",
      "n9>n12",
      "n10>n12",
      "n11>n12",
    ),
  },
};

// ---------------------------------------------------------------------------

const TOPIC_PULSE: WorkflowTemplate = {
  id: "topic-pulse",
  name: "See what people are saying about a topic",
  description:
    "11 steps. Searches Hacker News for any subject, reads the discussion, and reports the mood, the themes and the strongest opinions.",
  category: "Research",
  needs: "A subject to look up",
  workflow: {
    nodes: [
      ask("n1", "What subject?", 0, 1, [
        {
          name: "topic",
          type: "string",
          required: true,
          label: "Subject",
          placeholder: "workflow automation",
        },
      ]),

      fetchFrom("n2", "Search the discussion", 1, 1, {
        url: "https://hn.algolia.com/api/v1/search?query={{topic}}&tags=story&hitsPerPage=20",
        gives: { data: "hits", totalFound: "nbHits" },
      }),

      rule("n3", "Much being said?", 2, 0, "totalFound > 100"),

      rename("n4", "Note how much", 3, 0, {
        widelyDiscussed: "branch",
        mentionCount: "data.totalFound",
      }),

      {
        id: "n5",
        type: "logic" as const,
        position: at(2, 1),
        data: {
          label: "Take the top ten",
          config: { operation: "slice", expression: "0:10" },
        },
      },

      {
        id: "n6",
        type: "logic" as const,
        position: at(3, 1),
        data: {
          label: "Just what we need",
          config: {
            operation: "map",
            mappings: {
              heading: "item.title",
              score: "item.points",
              replies: "item.num_comments",
            },
          },
        },
      },

      {
        id: "n7",
        type: "logic" as const,
        position: at(4, 0),
        data: {
          label: "Add up the interest",
          config: { operation: "reduce", expression: "sum:score" },
        },
      },

      rename("n8", "Note the interest", 5, 0, { totalPoints: "result" }),

      think("n9", "Summarise the discussion", 4, 1, {
        system:
          "You summarise what a community is discussing, from a list of post titles with their scores and reply counts. Ground everything in the titles given.",
        prompt:
          "Posts about the subject:\n\n{{data}}\n\nWhat is the discussion actually about?",
        gives: {
          summary: { type: "string", description: "Three sentences at most" },
          themes: { type: "array", description: "The recurring themes" },
        },
      }),

      think("n10", "Read the mood", 4, 2, {
        system:
          "You judge the mood of a discussion from post titles and how much attention each got. Say when the titles do not tell you enough.",
        prompt:
          "Posts:\n\n{{data}}\n\nWhat is the mood, and what are the strongest opinions?",
        gives: {
          mood: {
            type: "string",
            description: "One of: enthusiastic, mixed, sceptical, critical",
          },
          strongOpinions: { type: "array", description: "The strongest views on show" },
        },
      }),

      result(
        "n11",
        "The read-out",
        6,
        1,
        [
          "# What people are saying",
          "",
          "{{summary}}",
          "",
          "Mood: **{{mood}}** · widely discussed: **{{widelyDiscussed}}** · **{{mentionCount}}** mentions · **{{totalPoints}}** points across the top ten",
          "",
          "## Themes",
          "{{themes}}",
          "",
          "## Strongest opinions",
          "{{strongOpinions}}",
        ].join("\n")
      ),

    ],
    edges: wire(
      "n1>n2",
      "n2>n3",
      "n3>n4",
      "n2>n5",
      "n5>n6",
      "n6>n7",
      "n7>n8",
      "n6>n9",
      "n6>n10",
      "n4>n11",
      "n8>n11",
      "n9>n11",
      "n10>n11",
    ),
  },
};

// ---------------------------------------------------------------------------
// Marketing helpers: the three step types the suite added.

function picture(
  id: string,
  label: string,
  col: number,
  row: number,
  opts: {
    prompt: string;
    size?: "square" | "wide" | "tall";
    quality?: "draft" | "standard" | "best";
    background?: "auto" | "transparent";
  }
) {
  return {
    id,
    type: "image" as const,
    position: at(col, row),
    data: {
      label,
      config: {
        promptTemplate: opts.prompt,
        size: opts.size ?? "square",
        quality: opts.quality ?? "standard",
        background: opts.background ?? "auto",
      },
    },
  };
}

function brandKit(
  id: string,
  label: string,
  col: number,
  row: number,
  opts: { name: string; tagline?: string }
) {
  return {
    id,
    type: "brand" as const,
    position: at(col, row),
    data: {
      label,
      config: {
        sourceTemplate: "{{assetId}}",
        businessNameTemplate: opts.name,
        taglineTemplate: opts.tagline ?? "",
        kindTemplate: "{{businessKind}}",
      },
    },
  };
}

function emailDesign(
  id: string,
  label: string,
  col: number,
  row: number,
  opts: {
    layout: "newsletter" | "promo" | "announcement";
    subject: string;
    preheader?: string;
    heading: string;
    body: string;
    ctaText?: string;
    ctaUrl?: string;
    brandColor?: string;
    footer?: string;
  }
) {
  return {
    id,
    type: "email" as const,
    position: at(col, row),
    data: {
      label,
      config: {
        layout: opts.layout,
        subjectTemplate: opts.subject,
        preheaderTemplate: opts.preheader ?? "",
        headingTemplate: opts.heading,
        bodyTemplate: opts.body,
        ctaTextTemplate: opts.ctaText ?? "",
        ctaUrlTemplate: opts.ctaUrl ?? "",
        brandColorTemplate: opts.brandColor ?? "",
        footerTemplate: opts.footer ?? "",
      },
    },
  };
}

// ---------------------------------------------------------------------------

const AD_CREATIVE_PACK: WorkflowTemplate = {
  id: "ad-creative-pack",
  name: "Turn your brand material into a finished ad",
  description:
    "9 steps. Reads the brand material you paste in, writes three headlines and the primary text from your own claims, checks nothing was invented, and generates the ad image to match.",
  category: "Marketing",
  needs: "What you sell, who it's for, and a paste of your brand material",
  workflow: {
    nodes: [
      ask("n1", "The brief", 0, 1, [
        {
          name: "product",
          type: "string",
          required: true,
          label: "What are you selling?",
          placeholder: "A booking tool for small salons, 29 euro a month",
          multiline: true,
        },
        {
          name: "audience",
          type: "string",
          required: true,
          label: "Who is it for?",
          placeholder: "Salon owners with two to ten chairs",
        },
        {
          name: "offer",
          type: "string",
          label: "The offer",
          placeholder: "20% off the first three months",
          default: "no discount, lead with value",
        },
        {
          name: "brandNotes",
          type: "string",
          required: true,
          label: "Paste your brand material",
          description:
            "Your site copy, ads that worked, product facts, reviews. The copy is written only from what is in here.",
          multiline: true,
        },
      ]),

      think("n2", "Find the angle", 1, 0, {
        system:
          "You find the advertising angle inside a brand's own material. Everything you extract must appear in the material given. Never invent a claim, a number, or a customer.",
        prompt:
          "Product: {{product}}\nAudience: {{audience}}\n\nBrand material:\n\n{{brandNotes}}\n\nFind the angle.",
        gives: {
          tone: { type: "string", description: "The voice the material already speaks in, two or three words" },
          allowedClaims: { type: "array", description: "Claims the material actually supports, verbatim where possible" },
          hook: { type: "string", description: "The single most compelling true thing to lead with" },
        },
      }),

      think("n3", "Write the copy", 1, 2, {
        temperature: 0.6,
        system:
          "You write ad copy using only the claims you are given. If a line needs a claim that is not in the list, write a different line. Short sentences. No exclamation marks.",
        prompt:
          "Product: {{product}}\nAudience: {{audience}}\nOffer: {{offer}}\nTone: {{tone}}\nHook: {{hook}}\nClaims you may use:\n{{allowedClaims}}\n\nWrite the ad copy.",
        gives: {
          headlineA: { type: "string", description: "Headline leading with the hook, under 40 characters" },
          headlineB: { type: "string", description: "Headline leading with the audience, under 40 characters" },
          headlineC: { type: "string", description: "Headline leading with the offer, under 40 characters" },
          primaryText: { type: "string", description: "Two or three short sentences of primary text" },
          cta: { type: "string", description: "The call to action, three words or fewer" },
        },
      }),

      think("n4", "Art direction", 1, 3, {
        system:
          "You write art direction for a single ad image. Describe one scene, its mood, its colours, and its composition. The image must contain no words, because generated lettering reads as a mistake.",
        prompt:
          "Product: {{product}}\nAudience: {{audience}}\nTone: {{tone}}\nHook: {{hook}}\n\nDescribe the ad image.",
        gives: {
          imagePrompt: {
            type: "string",
            description: "One paragraph an image model can paint from, ending with: no text, no words, no lettering",
          },
        },
      }),

      picture("n5", "Make the ad image", 2, 3, {
        prompt: "{{imagePrompt}}",
        size: "square",
        quality: "standard",
      }),

      rule("n6", "Discount led?", 2, 0, "offer contains '%'"),

      rename("n7", "Note the offer type", 3, 0, { discountLed: "branch" }),

      think("n8", "Check the grounding", 2, 1, {
        system:
          "You audit ad copy against a list of permitted claims. A claim in the copy that is not supported by the list gets flagged. Judge the substance, not the phrasing.",
        prompt:
          "Permitted claims:\n{{allowedClaims}}\n\nCopy:\n{{primaryText}}\n\nAudit it.",
        gives: {
          groundedScore: { type: "number", description: "1 to 10, where 10 means every claim is supported" },
          riskyClaims: { type: "array", description: "Lines worth a second look, or a single item saying all clear" },
        },
      }),

      result(
        "n9",
        "The ad pack",
        4,
        1,
        [
          "# The ad pack",
          "",
          "{{imageMarkdown}}",
          "",
          "**Hook:** {{hook}} · tone **{{tone}}** · discount led: **{{discountLed}}**",
          "",
          "## Headlines",
          "1. {{headlineA}}",
          "2. {{headlineB}}",
          "3. {{headlineC}}",
          "",
          "## Primary text",
          "{{primaryText}}",
          "",
          "**Call to action:** {{cta}}",
          "",
          "## Grounding check",
          "Score **{{groundedScore}}/10**. Worth a second look:",
          "{{riskyClaims}}",
          "",
          "## The offer",
          "{{offer}}",
        ].join("\n")
      ),

    ],
    edges: wire(
      "n1>n2",
      "n1>n3",
      "n2>n3",
      "n1>n4",
      "n2>n4",
      "n4>n5",
      "n1>n6",
      "n6>n7",
      "n2>n8",
      "n3>n8",
      "n1>n9",
      "n2>n9",
      "n3>n9",
      "n5>n9",
      "n7>n9",
      "n8>n9",
    ),
  },
};

// ---------------------------------------------------------------------------

const LOGO_BRAND_BOARD: WorkflowTemplate = {
  id: "logo-brand-board",
  name: "A logo concept and the whole brand board",
  description:
    "9 steps. Writes a design brief from your answers, generates a logo concept, puts it on a bottle, a cup, a tote, a card and a storefront, derives a colour palette from it, and lays it all out as a board.",
  category: "Marketing",
  needs: "The business name, what it does, and three style words",
  workflow: {
    nodes: [
      ask("n1", "The business", 0, 1, [
        {
          name: "businessName",
          type: "string",
          required: true,
          label: "The business name",
          placeholder: "Kalinaw Coffee",
        },
        {
          name: "whatItDoes",
          type: "string",
          required: true,
          label: "What does it do?",
          placeholder: "Small-batch coffee roasted in Iloilo",
          multiline: true,
        },
        {
          name: "styleWords",
          type: "string",
          required: true,
          label: "Three style words",
          placeholder: "warm, honest, modern",
        },
        {
          name: "tagline",
          type: "string",
          label: "A tagline",
          placeholder: "Slow mornings, good cups",
          default: "",
        },
        {
          name: "colorHint",
          type: "string",
          label: "A colour you already love",
          placeholder: "deep forest green",
          default: "whatever suits the style",
        },
      ]),

      think("n2", "Write the design brief", 1, 0, {
        system:
          "You write logo design briefs. The mark must work small, in one colour, and read in half a second. Prefer a simple geometric or lettermark concept over an illustration.",
        prompt:
          "Business: {{businessName}}\nWhat it does: {{whatItDoes}}\nStyle words: {{styleWords}}\nColour preference: {{colorHint}}\n\nWrite the brief and the image prompt.",
        gives: {
          logoPrompt: {
            type: "string",
            description:
              "One paragraph for an image model: a flat, minimal logo mark, centred, plain background, no photograph, no mockup, no shadows",
          },
          brief: { type: "string", description: "The design brief in two sentences" },
          styleSummary: { type: "string", description: "The style, restated in one line" },
          businessKind: {
            type: "string",
            description:
              "Exactly one of: drink, food, retail, construction, services, tech, other. Pick the closest.",
          },
        },
      }),

      picture("n3", "Logo concept", 2, 0, {
        prompt: "{{logoPrompt}}",
        size: "square",
        quality: "best",
        background: "transparent",
      }),

      brandKit("n4", "Mockups and palette", 3, 0, {
        name: "{{businessName}}",
        tagline: "{{tagline}}",
      }),

      think("n5", "Name the direction", 1, 2, {
        system:
          "You name creative directions so a team can talk about them. One short name and one honest sentence on why it fits this business.",
        prompt:
          "Business: {{businessName}}\nWhat it does: {{whatItDoes}}\nStyle words: {{styleWords}}\n\nName this direction.",
        gives: {
          directionName: { type: "string", description: "A short name for the direction, like a paint colour" },
          whyItFits: { type: "string", description: "One sentence on why it suits the business" },
        },
      }),

      think("n6", "Write the usage notes", 4, 2, {
        system:
          "You write brand usage notes a non-designer can follow. Concrete and short. Ground everything in the palette and style you are given.",
        prompt:
          "Style: {{styleSummary}}\nMain colour: {{primaryColor}}\nPalette: {{paletteHexes}}\n\nWrite the usage notes.",
        gives: {
          usageNotes: { type: "array", description: "Three or four dos, each one line" },
          avoidNotes: { type: "array", description: "Two or three things best avoided, each one line" },
        },
      }),

      rename("n7", "Keep the brief", 2, 1, { logoBrief: "brief" }),

      think("n10", "Draft the reveal", 2, 2, {
        temperature: 0.5,
        system:
          "You write the short message that introduces a new brand direction to a team or client. Warm, confident, three sentences at most, no corporate filler.",
        prompt:
          "Business: {{businessName}}\nDirection: {{directionName}}\nWhy it fits: {{whyItFits}}\n\nWrite the reveal message.",
        gives: {
          revealMessage: { type: "string", description: "The message, ready to send with the board" },
        },
      }),

      result(
        "n8",
        "The brand board",
        5,
        1,
        [
          "{{boardMarkdown}}",
          "",
          "---",
          "",
          "## The direction",
          "**{{directionName}}**",
          "",
          "{{whyItFits}}",
          "",
          "The brief behind the mark: {{logoBrief}}",
          "",
          "## Using it",
          "{{usageNotes}}",
          "",
          "Best avoided:",
          "{{avoidNotes}}",
          "",
          "---",
          "",
          "## Introducing it",
          "",
          "{{revealMessage}}",
        ].join("\n")
      ),

    ],
    edges: wire(
      "n1>n2",
      "n2>n3",
      "n3>n4",
      "n1>n4",
      "n1>n5",
      "n2>n6",
      "n4>n6",
      "n2>n7",
      "n1>n10",
      "n5>n10",
      "n4>n8",
      "n5>n8",
      "n6>n8",
      "n7>n8",
      "n10>n8",
    ),
  },
};

// ---------------------------------------------------------------------------

const EMAIL_CAMPAIGN: WorkflowTemplate = {
  id: "email-campaign",
  name: "An email campaign, designed and ready to send",
  description:
    "9 steps. Plans the email from your brand material, writes the copy, assembles it into a branded layout that renders properly in real email clients, and hands on the subject and HTML shaped for your sender.",
  category: "Marketing",
  needs: "Your brand material, the announcement, and where the button should go",
  workflow: {
    nodes: [
      ask("n1", "The campaign", 0, 1, [
        {
          name: "brandNotes",
          type: "string",
          required: true,
          label: "Paste your brand material",
          description: "Site copy, past emails, product facts. The email is written only from this.",
          multiline: true,
        },
        {
          name: "announcement",
          type: "string",
          required: true,
          label: "What are you announcing?",
          placeholder: "The new scheduling feature is live for everyone",
          multiline: true,
        },
        {
          name: "audience",
          type: "string",
          label: "Who gets this email?",
          placeholder: "Everyone on the free plan",
          default: "your subscribers",
        },
        {
          name: "ctaUrl",
          type: "string",
          required: true,
          label: "Where should the button go?",
          placeholder: "https://your-site.com/new",
        },
        {
          name: "brandColor",
          type: "string",
          label: "Your brand colour",
          placeholder: "#1a73e8",
          default: "#3366cc",
        },
      ]),

      think("n2", "Plan the email", 1, 0, {
        system:
          "You plan one email. The subject earns the open and never lies about the content. Everything must be supported by the material given.",
        prompt:
          "Brand material:\n{{brandNotes}}\n\nAnnouncement: {{announcement}}\nAudience: {{audience}}\n\nPlan it.",
        gives: {
          subject: { type: "string", description: "The subject line, under 50 characters" },
          preheader: { type: "string", description: "The line inboxes show after the subject, under 80 characters" },
          heading: { type: "string", description: "The heading inside the email" },
          goal: { type: "string", description: "The one action the email exists to cause" },
        },
      }),

      think("n3", "Write the body", 1, 2, {
        temperature: 0.5,
        system:
          "You write email body copy. Short paragraphs separated by blank lines. Where a list helps, write lines starting with '- '. Use only claims present in the brand material. End before you start repeating yourself.",
        prompt:
          "Brand material:\n{{brandNotes}}\n\nAnnouncement: {{announcement}}\nGoal: {{goal}}\nHeading: {{heading}}\n\nWrite the body.",
        gives: {
          bodyText: { type: "string", description: "The body: short paragraphs, blank lines between them, dashes for bullets" },
          ctaText: { type: "string", description: "The button label, three words or fewer" },
        },
      }),

      emailDesign("n4", "Assemble the email", 2, 1, {
        layout: "promo",
        subject: "{{subject}}",
        preheader: "{{preheader}}",
        heading: "{{heading}}",
        body: "{{bodyText}}",
        ctaText: "{{ctaText}}",
        ctaUrl: "{{ctaUrl}}",
        brandColor: "{{brandColor}}",
      }),

      think("n5", "Subject variants", 2, 0, {
        temperature: 0.7,
        system:
          "You write alternative subject lines for testing. Same promise, different angle. Under 50 characters each.",
        prompt: "The subject: {{subject}}\nPreview line: {{preheader}}\n\nWrite two alternatives.",
        gives: {
          subjectB: { type: "string", description: "A second subject, leading with the outcome" },
          subjectC: { type: "string", description: "A third subject, leading with the audience" },
        },
      }),

      think("n6", "Plain text version", 2, 3, {
        system:
          "You turn email copy into the plain text version senders attach alongside the HTML. Same content, no formatting, short lines.",
        prompt: "The body:\n{{bodyText}}\n\nButton: {{ctaText}}\n\nWrite the plain text version.",
        gives: {
          plainText: { type: "string", description: "The whole email as plain text" },
        },
      }),

      rename("n7", "Note the audience", 1, 4, { sendingTo: "audience" }),

      think("n10", "Preflight it", 2, 2, {
        system:
          "You preflight marketing emails before they send. Look for spam trigger phrasing, a promise the body does not keep, and a missing reason to act now. Ground every flag in the text given.",
        prompt: "The body:\n{{bodyText}}\n\nPreflight it.",
        gives: {
          spamVerdict: { type: "string", description: "One sentence: ready, or what to change first" },
          spamRisks: { type: "array", description: "Specific lines to reconsider, or a single item saying all clear" },
        },
      }),

      result(
        "n8",
        "The campaign",
        3,
        1,
        [
          "# {{subject}}",
          "",
          "{{previewMarkdown}}",
          "",
          "Sending to: **{{sendingTo}}** · preview line: {{preheader}}",
          "",
          "## Subject options",
          "1. {{subject}}",
          "2. {{subjectB}}",
          "3. {{subjectC}}",
          "",
          "## Before it goes out",
          "{{spamVerdict}}",
          "{{spamRisks}}",
          "",
          "## Plain text version",
          "{{plainText}}",
        ].join("\n")
      ),

    ],
    edges: wire(
      "n1>n2",
      "n1>n3",
      "n2>n3",
      "n1>n4",
      "n2>n4",
      "n3>n4",
      "n2>n5",
      "n3>n6",
      "n1>n7",
      "n3>n10",
      "n4>n8",
      "n5>n8",
      "n6>n8",
      "n7>n8",
      "n10>n8",

    ),
  },
};

// Named alias for the support-triage template used by tests and callers that
// reference it directly rather than by id lookup.
export const supportTriageTemplate = SUPPORT_TRIAGE;

export const TEMPLATES: WorkflowTemplate[] = [
  SUPPORT_TRIAGE,
  LEAD_QUALIFY,
  MEETING_NOTES,
  REVIEW_THEMES,
  GITHUB_BRIEF,
  TOPIC_PULSE,
  AD_CREATIVE_PACK,
  LOGO_BRAND_BOARD,
  EMAIL_CAMPAIGN,
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
