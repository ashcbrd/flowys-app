/**
 * What kind of thing a run produced, worked out from the run itself.
 *
 * Workflows do not carry a category, and asking builders to tag them would be
 * one more field nobody fills honestly. What a run made is evident from what
 * its steps handed on: a brand kit step leaves a board, an email step leaves
 * a preview, a picture step leaves an image. So the category is derived, per
 * run, from the outputs, and a workflow that grows an email step next month
 * files its new runs under Emails with no migration and no tagging.
 */

export type ResultCategory =
  | "brand"
  | "email"
  | "picture"
  | "written"
  | "data"
  | "failed";

export const RESULT_CATEGORIES: { id: ResultCategory; label: string }[] = [
  { id: "brand", label: "Brand boards" },
  { id: "picture", label: "Pictures" },
  { id: "email", label: "Emails" },
  { id: "written", label: "Written" },
  { id: "data", label: "Data" },
  { id: "failed", label: "Did not finish" },
];

export function categoryLabel(id: ResultCategory): string {
  return RESULT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export interface CategorizeInput {
  status: string;
  /** The final output step's declared format, when there was one. */
  format?: string;
  /** Every step's output, in run order. Only the keys matter here. */
  logOutputs: (Record<string, unknown> | undefined)[];
}

/**
 * Ranked by specificity: a brand run also contains images, an email run also
 * contains written copy, so the richer artifact wins the filing.
 */
export function categorizeRun(input: CategorizeInput): ResultCategory {
  if (input.status === "failed") return "failed";

  const keys = new Set<string>();
  for (const output of input.logOutputs) {
    if (!output) continue;
    for (const key of Object.keys(output)) keys.add(key);
  }

  if (keys.has("boardMarkdown")) return "brand";
  if (keys.has("emailHtml") || keys.has("previewUrl")) return "email";
  if (keys.has("imageMarkdown") || keys.has("imageUrl")) return "picture";
  if (input.format === "markdown" || input.format === "text") return "written";
  return "data";
}

/** The first stored image a run produced, for a thumbnail. */
export function firstImageUrl(
  logOutputs: (Record<string, unknown> | undefined)[]
): string | null {
  const pattern = /\/api\/assets\/[0-9a-f-]{36}\.png/i;
  for (const output of logOutputs) {
    if (!output) continue;
    const match = JSON.stringify(output).match(pattern);
    if (match) return match[0];
  }
  return null;
}
