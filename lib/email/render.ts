/**
 * Email HTML assembly: hand-authored layouts, model-filled slots.
 *
 * A model asked to write email HTML produces something that looks right in a
 * browser preview and breaks in a real client, because HTML email is not the
 * web: table layouts, inline styles only, 600px, and Outlook rendering with
 * the Word engine. So the layouts here are written once, by hand, to the old
 * rules, and the model only ever supplies text for named slots.
 *
 * Two consequences fall out of that split and both are the point:
 * - The email is correct by construction. There is no input that produces
 *   broken markup, because the markup is not an input.
 * - Every slot passes through one escape function, so model output and user
 *   text cannot smuggle markup in. The serving route's sandbox CSP is the
 *   second lock on the same door.
 *
 * Colours come from the palette derivation, and the button label colour is
 * chosen by the same AA guard the brand kit uses, so a brand colour nobody
 * could read a button on never ships.
 */
import {
  deriveBrandPalette,
  readableTextOn,
  parseHex,
  type BrandPalette,
} from "@/lib/brand/color";

/** Stored config values. Frozen: they persist inside saved workflows. */
export type EmailLayout = "newsletter" | "promo" | "announcement";

export const EMAIL_LAYOUTS: EmailLayout[] = ["newsletter", "promo", "announcement"];

export interface EmailSlots {
  subject: string;
  /** The line clients show after the subject; invisible in the body. */
  preheader?: string;
  heading: string;
  /** Paragraphs split on blank lines; lines starting "- " become bullets. */
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerText?: string;
}

export interface RenderEmailOptions {
  layout: EmailLayout;
  /** The brand colour. Anything unparseable falls back to a neutral blue. */
  brandColor?: string;
  logoUrl?: string;
  slots: EmailSlots;
}

const FALLBACK_COLOR = "#3366cc";
const FONT = "font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) URLs survive into an href; anything else becomes inert. */
function safeUrl(url: string | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return escapeHtml(trimmed);
}

/**
 * The body slot, turned into paragraph and bullet tables. This is the entire
 * grammar the model is allowed: blank-line paragraphs and "- " bullets.
 * Anything fancier belongs to the layout, not the content.
 */
function renderBody(body: string, palette: BrandPalette): string {
  const blocks = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));

      if (isList) {
        const items = lines
          .map(
            (line) =>
              `<tr><td width="24" valign="top" style="${FONT} font-size:15px; line-height:24px; color:${palette.primary};">&bull;</td>` +
              `<td valign="top" style="${FONT} font-size:15px; line-height:24px; color:${palette.ink};">${escapeHtml(line.slice(2))}</td></tr>`
          )
          .join("");
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">${items}</table>`;
      }

      return `<p style="${FONT} font-size:15px; line-height:24px; color:${palette.ink}; margin:0 0 16px 0;">${escapeHtml(
        lines.join(" ")
      )}</p>`;
    })
    .join("");
}

/** The padded-td button that survives every client, Outlook included. */
function renderButton(text: string, url: string, palette: BrandPalette): string {
  const label = readableTextOn(palette.primary);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>` +
    `<td bgcolor="${palette.primary}" style="border-radius:6px;">` +
    `<a href="${url}" target="_blank" style="${FONT} display:inline-block; padding:13px 28px; font-size:15px; font-weight:bold; color:${label}; text-decoration:none; border-radius:6px;">${escapeHtml(text)}</a>` +
    `</td></tr></table>`
  );
}

function renderLogo(logoUrl: string | undefined, height: number): string {
  const src = safeUrl(logoUrl);
  if (!src) return "";
  return `<img src="${src}" height="${height}" alt="" style="display:block; height:${height}px; width:auto; border:0;"/>`;
}

export function renderEmail(options: RenderEmailOptions): string {
  const brandColor = parseHex(options.brandColor ?? "")
    ? (options.brandColor as string)
    : FALLBACK_COLOR;

  // The palette derivation never returns null for a colour parseHex accepted.
  const palette = deriveBrandPalette(brandColor)!;
  const slots = options.slots;

  const preheader = slots.preheader?.trim()
    ? `<span style="display:none; font-size:1px; color:#ffffff; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${escapeHtml(slots.preheader.trim())}</span>`
    : "";

  const ctaUrl = safeUrl(slots.ctaUrl);
  const button =
    slots.ctaText?.trim() && ctaUrl ? renderButton(slots.ctaText.trim(), ctaUrl, palette) : "";

  const footer = `<p style="${FONT} font-size:12px; line-height:18px; color:#8a8a8a; margin:0;">${escapeHtml(
    slots.footerText?.trim() || "You are receiving this because you signed up for updates."
  )}</p>`;

  const body = renderBody(slots.body, palette);
  const heading = escapeHtml(slots.heading);

  let header: string;
  let headingBlock: string;

  switch (options.layout) {
    case "promo":
      // A saturated hero: the header carries the brand colour and the heading
      // sits inside it, reversed. Built to shout once.
      header =
        `<td bgcolor="${palette.primary}" style="padding:40px 40px 32px 40px; border-radius:8px 8px 0 0;" align="center">` +
        renderLogo(options.logoUrl, 36) +
        `<h1 style="${FONT} font-size:28px; line-height:36px; color:${readableTextOn(palette.primary)}; margin:${options.logoUrl ? "20px" : "0"} 0 0 0;">${heading}</h1>` +
        `</td>`;
      headingBlock = "";
      break;

    case "announcement":
      // Quiet and centred: a thin brand rule under the logo, then the news.
      header =
        `<td align="center" style="padding:40px 40px 0 40px;">` +
        renderLogo(options.logoUrl, 32) +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="48" style="margin:24px 0 0 0;"><tr><td height="3" bgcolor="${palette.primary}" style="font-size:1px; line-height:1px;">&nbsp;</td></tr></table>` +
        `</td>`;
      headingBlock = `<h1 style="${FONT} font-size:24px; line-height:32px; color:${palette.ink}; margin:0 0 16px 0; text-align:center;">${heading}</h1>`;
      break;

    case "newsletter":
    default:
      // The workhorse: logo on a tinted band, left-aligned reading below.
      header =
        `<td bgcolor="${palette.primaryLight}" style="padding:24px 40px; border-radius:8px 8px 0 0;">` +
        renderLogo(options.logoUrl, 32) +
        `</td>`;
      headingBlock = `<h1 style="${FONT} font-size:24px; line-height:32px; color:${palette.ink}; margin:0 0 16px 0;">${heading}</h1>`;
      break;
  }

  const centreBody = options.layout === "announcement" ? " text-align:center;" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${escapeHtml(slots.subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:${palette.paper};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.paper}">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:8px;">
<tr>${header}</tr>
<tr><td style="padding:32px 40px 8px 40px;${centreBody}">
${headingBlock}
${body}
${button}
</td></tr>
<tr><td style="padding:0 40px 32px 40px; border-top:1px solid #eeeeee; padding-top:20px;${centreBody}">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
