import { describe, it, expect } from "vitest";
import { getNodeSubtitle } from "@/components/nodes/BaseNode";
import { LOGIC_OPERATIONS } from "@/lib/vocabulary";
import { supportTriageTemplate } from "@/lib/templates";

/**
 * The card under a step's title is user-facing wording, so it comes from
 * `lib/vocabulary.ts` like every other label. It used to come from a hardcoded
 * map inside the component that listed three operations the engine has never
 * had and omitted five it does, so a condition step rendered the stored value
 * "condition" on the canvas.
 */
describe("step card subtitle", () => {
  it("names every operation the engine supports", () => {
    for (const term of LOGIC_OPERATIONS) {
      const subtitle = getNodeSubtitle({ operation: term.value });
      expect(subtitle, `operation "${term.value}" has no label`).toBe(
        term.label
      );
    }
  });

  it("never renders a stored operation value", () => {
    for (const term of LOGIC_OPERATIONS) {
      const subtitle = getNodeSubtitle({ operation: term.value });
      expect(subtitle, `"${term.value}" leaked to the canvas`).not.toBe(
        term.value
      );
    }
  });

  it("labels both decision steps in the support triage template", () => {
    const conditions = supportTriageTemplate.workflow.nodes.filter(
      (n) =>
        n.type === "logic" &&
        (n.data.config as Record<string, unknown>).operation === "condition"
    );

    // Escalate? and At risk of leaving?
    expect(conditions).toHaveLength(2);

    for (const node of conditions) {
      expect(
        getNodeSubtitle(node.data.config as Record<string, unknown>)
      ).toBe("Take a different path");
    }
  });
});
