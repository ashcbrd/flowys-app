import type { NodeHandler, NodeContext, NodeResult, BrandNodeConfig } from "./types";
import { interpolateVariables } from "@/lib/utils/template";

/**
 * The step that turns one logo image into brand material: mockups, a palette,
 * and a board that lays it all out.
 *
 * Everything downstream of the logo is deterministic code, not generation.
 * The mockups are the exact logo composited onto committed scene photos, the
 * palette is derived in OKLCH from the logo's own dominant colour with a WCAG
 * guard, and the board is assembled markdown. One generation cost per run,
 * everything else free and repeatable.
 *
 * The step reads only assets its own run owner produced, so a workflow can
 * never build a brand board from another account's images.
 */
export class BrandNodeHandler implements NodeHandler {
  type = "brand" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as BrandNodeConfig;

    if (!context.userId) {
      return {
        success: false,
        error: "This run has no owner attached, so the brand kit cannot be saved",
      };
    }

    const scope = { ...context.globalContext, ...context.inputs };

    const sourceRef = interpolateVariables(config.sourceTemplate || "{{assetId}}", scope).trim();
    const businessName =
      interpolateVariables(config.businessNameTemplate || "", scope, "empty").trim() || "Brand board";
    const tagline = interpolateVariables(config.taglineTemplate || "", scope, "empty").trim();
    const rawKind = interpolateVariables(config.kindTemplate || "{{businessKind}}", scope, "empty").trim();

    try {
      const { parseAssetId, getOwnedAssetData, saveAsset } = await import("@/lib/assets/store");

      const assetId = parseAssetId(sourceRef);
      if (!assetId) {
        return {
          success: false,
          error: "No picture arrived from an earlier step. Connect a picture step in front of this one.",
        };
      }

      const logo = await getOwnedAssetData(assetId, context.userId);
      if (!logo || logo.kind !== "image") {
        return {
          success: false,
          error: "The picture this step points at could not be found.",
        };
      }

      const logoPng = logo.data;

      const { composeMockups, extractLogoColor, paletteStripPng, normalizeKind } = await import(
        "@/lib/brand/mockups"
      );
      const { deriveBrandPalette } = await import("@/lib/brand/color");
      const { buildBoardMarkdown } = await import("@/lib/brand/board");

      const primaryColor = (await extractLogoColor(logoPng)) ?? "#3366cc";
      const palette = deriveBrandPalette(primaryColor)!;

      const paletteHexes = [
        palette.primary,
        palette.primaryDark,
        palette.primaryLight,
        palette.accent,
        palette.ink,
      ];

      const strip = await paletteStripPng(paletteHexes);
      const stripSaved = await saveAsset({
        userId: context.userId,
        kind: "image",
        contentType: "image/png",
        data: strip,
      });

      const mockups = await composeMockups(logoPng, normalizeKind(rawKind));
      const mockupUrls: { title: string; url: string }[] = [];
      for (const mockup of mockups) {
        const saved = await saveAsset({
          userId: context.userId,
          kind: "image",
          contentType: "image/png",
          data: mockup.png,
        });
        mockupUrls.push({ title: mockup.title, url: saved.url });
      }

      const boardMarkdown = buildBoardMarkdown({
        businessName,
        tagline: tagline || undefined,
        logoUrl: `/api/assets/${assetId}.png`,
        palette,
        paletteStripUrl: stripSaved.url,
        mockups: mockupUrls,
      });

      return {
        success: true,
        output: {
          boardMarkdown,
          primaryColor: palette.primary,
          paletteHexes,
          mockupCount: mockupUrls.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Building the brand kit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const c = config as Partial<BrandNodeConfig>;

    for (const key of ["sourceTemplate", "businessNameTemplate", "taglineTemplate", "kindTemplate"] as const) {
      if (c[key] !== undefined && typeof c[key] !== "string") {
        errors.push(`${key} must be text`);
      }
    }

    return errors.length ? { valid: false, errors } : { valid: true };
  }
}
