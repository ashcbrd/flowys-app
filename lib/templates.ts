/**
 * Workflow Templates
 *
 * Ready-made workflows a user can run without building anything.
 *
 * Every template runs on steps that need no app connections and no
 * user-specific URLs — questions, AI steps, rules, and a result. A template that
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
        // No provider or model — the engine resolves which AI to use.
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

/** `wire("a>b", "b>c")` — keeps a wide graph's edges legible. */
function wire(...pairs: string[]) {
  return pairs.map((pair, i) => {
    const [source, target] = pair.split(">");
    return { id: `edge_${i + 1}`, source, target };
  });
}

// ---------------------------------------------------------------------------

const SUPPORT_TRIAGE: WorkflowTemplate = {
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
          description: "Include the whole thing — signature and all.",
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
      "n12>n13"
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
          placeholder: "Hi — we're a 40-person agency and budget is approved…",
        },
        {
          name: "idealCustomer",
          type: "string",
          required: true,
          label: "Who do you want to work with?",
          description: "One sentence is enough.",
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
      "n12>n13"
    ),
  },
};

// ---------------------------------------------------------------------------

const MEETING_NOTES: WorkflowTemplate = {
  id: "meeting-actions",
  name: "Turn a meeting recording into decisions and actions",
  description:
    "14 steps. Takes a transcript and pulls out what was decided, who owes what, what's still open, and the risks — then drafts the follow-up message.",
  category: "Meetings",
  needs: "A transcript file — a .txt export from your recorder works",
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
          actions: { type: "array", description: "Each as 'Owner — action'" },
          unassignedCount: { type: "number", description: "How many actions have no owner" },
        },
      }),

      think("n4", "Find what's still open", 1, 3, {
        system:
          "You spot unresolved threads in meetings — questions asked but not answered, topics deferred.",
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
          "# {{summary}}",
          "",
          "Decisions made: **{{anyDecisions}}** · actions without an owner: **{{unownedTally}}** ({{hasUnowned}})",
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
      "n13>n14"
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
  needs: "A file of reviews — a CSV export works well",
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
          "You spot feedback mentioned only once or twice that still matters — early warnings, not noise.",
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
          "**{{biggestRisk}}** — {{riskReason}}",
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
      "n9>n10"
    ),
  },
};

export const TEMPLATES: WorkflowTemplate[] = [
  SUPPORT_TRIAGE,
  LEAD_QUALIFY,
  MEETING_NOTES,
  REVIEW_THEMES,
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
