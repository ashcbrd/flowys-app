import { describe, expect, it } from "vitest";
import { createExecutor } from "@/lib/engine/executor";
import { TEMPLATES } from "@/lib/templates";
import type { InputField } from "@/lib/nodes/types";

/**
 * Runs every shipped template against a real model.
 *
 * The default suite runs these with the model call stubbed, which proves the
 * wiring. This proves the prompts and declared shapes actually hold up when a
 * model answers them — that the schema comes back populated, and that nothing
 * renders as an unfilled {{token}}.
 *
 * Templates pin no provider or model — the engine resolves the target — so this
 * runs the shipped config exactly as a user would.
 */

/** Realistic answers for whatever a template asks for. */
const ANSWERS: Record<string, string> = {
  emailText:
    "Subject: still broken\n\nHi — since Tuesday the CSV export fails every time on our reporting workspace. I have emailed twice and heard nothing. We need this for month-end on Friday and right now we are copying rows by hand. This is the third time this quarter.\n\nPriya\nOps Lead, Acme",
  customerName: "Priya at Acme",
  plan: "Pro",
  enquiry:
    "Hi — we're a 40-person agency, budget is approved for this quarter, and we'd like to roll this out to two teams next month. I run ops so I can sign off. Can we start a trial?",
  idealCustomer: "Software and agency teams of 10-200 who already pay for tools",
  yourOffer: "Workflow automation, from £99/month",
  transcript:
    "Sam: right, decision time on the export rewrite. Priya: I think we ship the queue-based version, the sync one keeps timing out. Sam: agreed, let's commit to the queue. Alex: who owns the migration? Sam: Priya, can you take it? Priya: yes, I'll have a plan by Thursday. Alex: what about the pricing question from last week? Sam: park it, we'll come back after the export work. Priya: one worry — if the queue backs up we have no alerting at all. Alex: nobody has picked up the alerting piece. Sam: leave it for now, note it. Alex: also we still need to decide the retention window. Sam: next meeting.",
  attendees: "Sam, Priya, Alex",
  owner: "vercel",
  repo: "next.js",
  topic: "workflow automation",
  meetingName: "Export rewrite review",
  reviews: [
    "Love the new dashboard, much faster than before.",
    "Export keeps timing out on large files. Frustrating.",
    "Support replied in ten minutes, genuinely impressed.",
    "Mobile app is unusable on small screens.",
    "Pricing feels steep for a team of three.",
    "Export broke again today, second time this week.",
    "The onboarding was clear and quick.",
    "Wish it integrated with our ticketing tool.",
  ].join("\n"),
  productName: "the app",
};

function answersFor(template: (typeof TEMPLATES)[number]) {
  const inputNode = template.workflow.nodes.find((n) => n.type === "input");
  const fields = (inputNode?.data.config?.fields as InputField[] | undefined) || [];

  const input: Record<string, unknown> = {};
  for (const field of fields) {
    // A missing answer used to fall back to "sample <name>", which for a field
    // feeding a URL produced a puzzling 404 from the service rather than a clear
    // test failure. Fail loudly at the source instead.
    const answer = ANSWERS[field.name];
    if (answer === undefined) {
      throw new Error(
        `No live-test answer for the "${field.name}" field. Add one to ANSWERS.`
      );
    }
    input[field.name] = answer;
  }
  return input;
}

describe("shipped templates against a real model", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s produces a usable result",
    async (_id, template) => {
      const executor = createExecutor(
        template.workflow.nodes as never,
        template.workflow.edges as never
      );

      const result = await executor.execute(answersFor(template));

      if (!result.success) {
        // GitHub allows 60 unauthenticated calls an hour per address. Running this
        // suite repeatedly exhausts that, which is a quota fact rather than a
        // broken template — say so instead of reporting a false failure.
        const rateLimited =
          /\b(403|429)\b|rate limit/i.test(result.error ?? "") &&
          template.workflow.nodes.some(
            (n) =>
              n.type === "api" &&
              String((n.data.config as { url?: string }).url ?? "").includes("api.github.com")
          );

        if (rateLimited) {
          // eslint-disable-next-line no-console
          console.warn(
            `SKIPPED ${template.id}: GitHub rate limit reached, not a template fault.`
          );
          return;
        }

        throw new Error(
          `${result.error}\n  diagnosis: ${result.errorAnalysis?.possibleCauses?.join("; ")}`
        );
      }

      // Every step ran.
      expect(result.logs).toHaveLength(template.workflow.nodes.length);
      expect(result.logs.every((l) => l.status === "completed")).toBe(true);

      const rendered = JSON.stringify(result.output);

      // Nothing left unfilled, and something was actually produced.
      expect(rendered, "output contains an unfilled token").not.toMatch(/\{\{\w/);
      expect(rendered.length).toBeGreaterThan(40);

      // eslint-disable-next-line no-console
      console.log(`\n--- ${template.name} ---\n${
        typeof result.output?.result === "string"
          ? (result.output.result as string).slice(0, 600)
          : JSON.stringify(result.output, null, 2).slice(0, 600)
      }\n`);
    },
    180_000
  );
});
