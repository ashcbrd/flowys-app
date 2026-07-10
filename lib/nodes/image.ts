import type { NodeHandler, NodeContext, NodeResult, ImageNodeConfig } from "./types";
import { interpolateVariables } from "@/lib/utils/template";

/**
 * The step that turns a description into a picture.
 *
 * The step hands a URL downstream, never bytes: the image lands in the asset
 * store under the run owner and later steps (the brand kit, an output
 * template, a webhook payload) refer to it by address. `imageMarkdown` exists
 * so an output step can drop the picture straight into a formatted result
 * with one {{token}}.
 */
export class ImageNodeHandler implements NodeHandler {
  type = "image" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as ImageNodeConfig;

    if (!context.userId) {
      // Fail closed: a generated image is stored, and stored things need an
      // owner. Same rule as the document-search step.
      return {
        success: false,
        error: "This run has no owner attached, so the picture cannot be saved",
      };
    }

    const prompt = interpolateVariables(config.promptTemplate ?? "", {
      ...context.globalContext,
      ...context.inputs,
    }).trim();

    // A prompt that is nothing but unresolved {{placeholders}} would generate
    // a picture of literal braces. Same guard as retrieval.
    const withoutPlaceholders = prompt.replace(/\{\{[^}]*\}\}/g, "").trim();
    if (!withoutPlaceholders) {
      return {
        success: false,
        error: "The picture description came out empty. Check the step's text and its {{placeholders}}.",
      };
    }

    try {
      // Imported lazily so the unit suite and the engine's other steps never
      // pay for the OpenAI client or the database.
      const { generateImage } = await import("@/lib/providers/images");
      const { saveAsset } = await import("@/lib/assets/store");

      const image = await generateImage({
        prompt,
        size: config.size ?? "square",
        quality: config.quality ?? "standard",
        background: config.background ?? "auto",
      });

      const saved = await saveAsset({
        userId: context.userId,
        kind: "image",
        contentType: image.contentType,
        data: image.data,
        prompt,
        model: image.model,
      });

      const alt = prompt.replace(/\s+/g, " ").slice(0, 80);

      return {
        success: true,
        output: {
          assetId: saved.id,
          imageUrl: saved.url,
          imageMarkdown: `![${alt}](${saved.url})`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Making the picture failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const c = config as Partial<ImageNodeConfig>;

    if (!c.promptTemplate || typeof c.promptTemplate !== "string" || !c.promptTemplate.trim()) {
      errors.push("Describe the picture. It can use {{placeholders}} from earlier steps.");
    }
    if (c.size !== undefined && !["square", "wide", "tall"].includes(c.size)) {
      errors.push("The shape must be square, wide, or tall.");
    }
    if (c.quality !== undefined && !["draft", "standard", "best"].includes(c.quality)) {
      errors.push("The quality must be draft, standard, or best.");
    }
    if (c.background !== undefined && !["auto", "transparent"].includes(c.background)) {
      errors.push("The background must be filled in or see-through.");
    }

    return errors.length ? { valid: false, errors } : { valid: true };
  }
}
