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
  feedback:
    "The CSV export has been failing since Tuesday. I emailed support twice and heard nothing. We rely on this for month-end reporting.",
  customerName: "Sam at Northwind",
  reviews: [
    "Love the new dashboard, much faster than before.",
    "Export keeps timing out on large files. Frustrating.",
    "Support replied in ten minutes, genuinely impressed.",
    "Mobile app is unusable on small screens.",
    "Pricing feels steep for a team of three.",
    "Export broke again today.",
  ].join("\n"),
  enquiry:
    "Hi — we're a 40-person agency, budget approved, and want to roll this out to two teams next month. Can we start a trial?",
  idealCustomer: "Software and agency teams of 10-200 who already pay for tools",
  email:
    "Subject: urgent\n\nHi there,\n\nSince the update this morning nobody on my team can log in — we just get a spinner. We have a client demo at 4pm. Please help.\n\nThanks,\nPriya\nOps Lead, Acme",
  notes:
    "Three people asked for Slack notifications. Export timeouts reported twice more. One churn risk mentioned pricing. Support response times praised by two customers.",
  weekOf: "3 March",
};

function answersFor(template: (typeof TEMPLATES)[number]) {
  const inputNode = template.workflow.nodes.find((n) => n.type === "input");
  const fields = (inputNode?.data.config?.fields as InputField[] | undefined) || [];

  const input: Record<string, unknown> = {};
  for (const field of fields) {
    input[field.name] = ANSWERS[field.name] ?? `sample ${field.name}`;
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
