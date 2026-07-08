/**
 * Brand board assembly: everything the brand kit produced, laid out as one
 * markdown document the result renderer can show and the preview surface can
 * share.
 *
 * Pure string-building on purpose. The compositing and colour extraction
 * (sharp, filesystem) live in mockups.ts; this file takes URLs and hex codes
 * and never touches an effect, so the layout is testable as text.
 */
import type { BrandPalette } from "@/lib/brand/color";

export interface BoardInput {
  businessName: string;
  tagline?: string;
  logoUrl: string;
  palette: BrandPalette;
  paletteStripUrl: string;
  mockups: { title: string; url: string }[];
}

const ROLE_NOTES: [keyof BrandPalette, string][] = [
  ["primary", "The brand colour. Buttons, links, anything that asks to be pressed."],
  ["primaryDark", "The same voice, lowered. Hover states and depth."],
  ["primaryLight", "A tinted background the primary can sit on."],
  ["ink", "Body text. Near-black, pulled slightly toward the brand hue."],
  ["paper", "Page background. Near-white, same pull."],
  ["accent", "The second voice, for highlights and charts."],
  ["onPrimary", "Text on the brand colour. Checked to pass WCAG AA."],
];

/** "primaryDark" reads as "Primary dark" on the board. */
function roleLabel(role: string): string {
  const spaced = role.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function buildBoardMarkdown(input: BoardInput): string {
  const lines: string[] = [];

  lines.push(`# ${input.businessName}`);
  if (input.tagline?.trim()) {
    lines.push("", `*${input.tagline.trim()}*`);
  }

  lines.push("", "## The mark", "", `![${input.businessName} logo](${input.logoUrl})`);
  lines.push(
    "",
    "A generated concept: use it to judge the direction, and have the winner redrawn as a vector before it goes near a printer."
  );

  lines.push("", "## Colours", "", `![Palette](${input.paletteStripUrl})`, "");
  lines.push("| Colour | Hex | Where it goes |", "| --- | --- | --- |");
  for (const [role, note] of ROLE_NOTES) {
    lines.push(`| ${roleLabel(role)} | \`${input.palette[role].toUpperCase()}\` | ${note} |`);
  }

  lines.push("", "## In the world", "");
  for (const mockup of input.mockups) {
    lines.push(`### ${mockup.title}`, "", `![${mockup.title}](${mockup.url})`, "");
  }

  return lines.join("\n").trim();
}
