import type { NodeHandler, NodeContext, NodeResult, EmailNodeConfig } from "./types";
import { interpolateVariables } from "@/lib/utils/template";

/**
 * The step that assembles a branded email.
 *
 * The layouts are hand-authored table HTML in lib/email/render.ts; this step
 * only resolves the content slots from earlier steps and hands the result on
 * two ways: `emailHtml` + `subject` shaped for a webhook step to POST to any
 * key-auth sender (Resend, SendGrid, Brevo), and `previewUrl` so a person can
 * open the finished email before anything sends.
 */
export class EmailNodeHandler implements NodeHandler {
  type = "email" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as EmailNodeConfig;

    if (!context.userId) {
      return {
        success: false,
        error: "This run has no owner attached, so the email preview cannot be saved",
      };
    }

    const scope = { ...context.globalContext, ...context.inputs };
    // "note" turns an unresolved {{token}} into "_no value_" mid-prose, which
    // is wrong for an email; "empty" drops it silently, which is worse for the
    // two slots a sender cannot do without. Resolve empty, then check those.
    const slot = (template: string | undefined) =>
      interpolateVariables(template || "", scope, "empty").trim();

    const subject = slot(config.subjectTemplate);
    const heading = slot(config.headingTemplate);
    const body = slot(config.bodyTemplate);

    if (!subject || !body) {
      return {
        success: false,
        error: "The email needs at least a subject and body text. Check the step's {{placeholders}}.",
      };
    }

    try {
      const { renderEmail, EMAIL_LAYOUTS } = await import("@/lib/email/render");
      const { saveAsset } = await import("@/lib/assets/store");

      const layout = EMAIL_LAYOUTS.includes(config.layout as never)
        ? (config.layout as (typeof EMAIL_LAYOUTS)[number])
        : "newsletter";

      const emailHtml = renderEmail({
        layout,
        brandColor: slot(config.brandColorTemplate),
        logoUrl: slot(config.logoUrlTemplate) || undefined,
        slots: {
          subject,
          preheader: slot(config.preheaderTemplate) || undefined,
          heading: heading || subject,
          body,
          ctaText: slot(config.ctaTextTemplate) || undefined,
          ctaUrl: slot(config.ctaUrlTemplate) || undefined,
          footerText: slot(config.footerTemplate) || undefined,
        },
      });

      const preview = await saveAsset({
        userId: context.userId,
        kind: "email",
        contentType: "text/html",
        data: Buffer.from(emailHtml, "utf8"),
      });

      return {
        success: true,
        output: {
          subject,
          preheader: slot(config.preheaderTemplate),
          emailHtml,
          previewUrl: preview.url,
          previewMarkdown: `[Open the email preview](${preview.url})`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Assembling the email failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const c = config as Partial<EmailNodeConfig>;

    if (!c.subjectTemplate || typeof c.subjectTemplate !== "string" || !c.subjectTemplate.trim()) {
      errors.push("Give the email a subject. It can use {{placeholders}} from earlier steps.");
    }
    if (!c.bodyTemplate || typeof c.bodyTemplate !== "string" || !c.bodyTemplate.trim()) {
      errors.push("Give the email body text. It can use {{placeholders}} from earlier steps.");
    }
    if (
      c.layout !== undefined &&
      !["newsletter", "promo", "announcement"].includes(c.layout)
    ) {
      errors.push("The look must be newsletter, promo, or announcement.");
    }

    return errors.length ? { valid: false, errors } : { valid: true };
  }
}
