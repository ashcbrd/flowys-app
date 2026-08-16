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
function renderBody(body: string, palette: BrandPalette, centered = false): string {
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
              `<tr><td width="26" valign="top" style="${FONT} font-size:16px; line-height:27px; color:${palette.primary}; font-weight:bold;">&bull;</td>` +
              `<td valign="top" style="${FONT} font-size:16px; line-height:27px; color:${palette.ink}; padding-bottom:6px; text-align:left;">${escapeHtml(line.slice(2))}</td></tr>`
          )
          .join("");
        return centered
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px auto;">${items}</table>`
          : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">${items}</table>`;
      }

      return `<p style="${FONT} font-size:16px; line-height:27px; color:${palette.ink}; margin:0 0 18px 0;">${escapeHtml(
        lines.join(" ")
      )}</p>`;
    })
    .join("");
}

/** The padded-td button that survives every client, Outlook included. */
function renderButton(text: string, url: string, palette: BrandPalette): string {
  const label = readableTextOn(palette.primary);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 28px 0;"><tr>` +
    `<td bgcolor="${palette.primary}" style="border-radius:10px;">` +
    `<a href="${url}" target="_blank" style="${FONT} display:inline-block; padding:15px 34px; font-size:15px; font-weight:bold; letter-spacing:0.3px; color:${label}; text-decoration:none; border-radius:10px;">${escapeHtml(text)}</a>` +
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

  const body = renderBody(slots.body, palette, options.layout === "announcement");
  const heading = escapeHtml(slots.heading);

  let header: string;
  let headingBlock: string;

  // A 1px hairline between distinct visual zones, in the brand's own tint.
  const hairline = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="#e9eaee" style="font-size:1px; line-height:1px;">&nbsp;</td></tr></table>`;

  switch (options.layout) {
    case "promo": {
      // A saturated hero: the brand colour carries the whole top of the card,
      // the heading sits reversed inside it at display size, and a thin
      // primaryDark base line gives the block a floor. Built to shout once.
      const onHero = readableTextOn(palette.primary);
      header =
        `<td bgcolor="${palette.primary}" style="padding:52px 48px 44px 48px; border-radius:14px 14px 0 0;" align="center">` +
        renderLogo(options.logoUrl, 40) +
        `<h1 style="${FONT} font-size:34px; line-height:42px; font-weight:800; letter-spacing:-0.5px; color:${onHero}; margin:${options.logoUrl ? "24px" : "0"} 0 0 0;">${heading}</h1>` +
        `</td></tr><tr><td height="5" bgcolor="${palette.primaryDark}" style="font-size:1px; line-height:1px;">&nbsp;`;
      headingBlock = "";
      break;
    }

    case "announcement":
      // Quiet and centred: generous air, the logo, a short brand rule, then
      // the news in a serif-adjacent weight. The restraint is the design.
      header =
        `<td align="center" style="padding:56px 48px 0 48px;">` +
        renderLogo(options.logoUrl, 34) +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="44" align="center" style="margin:${options.logoUrl ? "28px" : "0"} auto 0 auto;"><tr><td height="4" bgcolor="${palette.primary}" style="font-size:1px; line-height:1px; border-radius:2px;">&nbsp;</td></tr></table>` +
        `</td>`;
      headingBlock = `<h1 style="${FONT} font-size:30px; line-height:39px; font-weight:800; letter-spacing:-0.4px; color:${palette.ink}; margin:0 0 20px 0; text-align:center;">${heading}</h1>`;
      break;

    case "newsletter":
    default:
      // The workhorse: a slim brand accent along the card's top edge, the
      // logo on a tinted band, then left-aligned reading with a big heading.
      header = safeUrl(options.logoUrl)
        ? `<td height="5" bgcolor="${palette.primary}" style="font-size:1px; line-height:1px; border-radius:14px 14px 0 0;">&nbsp;</td></tr>` +
          `<tr><td bgcolor="${palette.primaryLight}" style="padding:26px 48px;">` +
          renderLogo(options.logoUrl, 34) +
          `</td>`
        : `<td height="5" bgcolor="${palette.primary}" style="font-size:1px; line-height:1px; border-radius:14px 14px 0 0;">&nbsp;</td>`;
      headingBlock = `<h1 style="${FONT} font-size:28px; line-height:37px; font-weight:800; letter-spacing:-0.4px; color:${palette.ink}; margin:0 0 20px 0;">${heading}</h1>`;
      break;
  }

  const centreBody = options.layout === "announcement" ? " text-align:center;" : "";
  const centreButton = options.layout === "announcement" || options.layout === "promo";

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
<tr><td align="center" style="padding:40px 16px 48px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:14px; border:1px solid #e9eaee;">
<tr>${header}</tr>
<tr><td style="padding:40px 48px 10px 48px;${centreBody}">
${headingBlock}
${body}
${centreButton && button ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">${button}</td></tr></table>` : button}
</td></tr>
<tr><td style="padding:0 48px;">${hairline}</td></tr>
<tr><td style="padding:22px 48px 36px 48px;${centreBody}">
${footer}
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
<tr><td align="center" style="${FONT} padding:20px 12px 0 12px; font-size:12px; line-height:18px; color:#9aa0aa;">${escapeHtml(slots.subject)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
