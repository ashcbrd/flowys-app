import type { NodeHandler, NodeContext, NodeResult, AiNodeConfig } from "./types";
import { executePrompt, type PromptMessage, type OutputSchema } from "@/lib/providers";
import { interpolateVariables } from "@/lib/utils/template";
import { resolveAiTarget } from "@/lib/providers/models";

export class AiNodeHandler implements NodeHandler {
  type = "ai" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as AiNodeConfig;

    try {
      const userPrompt = interpolateVariables(config.userPromptTemplate, {
        ...context.inputs,
        ...context.globalContext,
      });

      const messages: PromptMessage[] = [];

      const conciseInstructions = `

CRITICAL INSTRUCTIONS FOR YOUR RESPONSE:
- Respond with valid JSON only - no markdown, no explanations
- Keep ALL string values SHORT (under 150 characters each)
- Use brief, summarized content - not verbose descriptions
- Complete the entire JSON structure - do not truncate
- If listing items, include only essential information per item`;

      if (config.systemPrompt) {
        messages.push({
          role: "system",
          content: this.sanitizePrompt(config.systemPrompt) + conciseInstructions,
        });
      } else {
        messages.push({
          role: "system",
          content: "You are a helpful assistant." + conciseInstructions,
        });
      }

      messages.push({
        role: "user",
        content: this.sanitizePrompt(userPrompt),
      });

      // The provider and model are fixed for this deployment, so a stored value
      // (possibly a retired model, or a provider with no key) is ignored.
      const target = resolveAiTarget();

      const result = await executePrompt(
        target.provider,
        {
          model: target.model,
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens ?? 16384,
        },
        messages,
        config.outputSchema as OutputSchema
      );

      return {
        success: true,
        output: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `AI execution error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private sanitizePrompt(prompt: string): string {
    const dangerousPatterns = [
      /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
      /disregard\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
      /forget\s+(all\s+)?(previous|above|prior)\s+instructions?/gi,
      /you\s+are\s+now\s+a\s+different/gi,
      /new\s+instructions?:/gi,
      /system\s*:\s*you\s+are/gi,
    ];

    let sanitized = prompt;
    for (const pattern of dangerousPatterns) {
      sanitized = sanitized.replace(pattern, "[FILTERED]");
    }

    return sanitized;
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    // Lenient validation for save - only check types, not required values
    // Required values are validated at execution time
    const errors: string[] = [];

    if (config.provider !== undefined && !["openai", "anthropic"].includes(config.provider as string)) {
      errors.push("provider must be 'openai' or 'anthropic'");
    }

    if (config.model !== undefined && typeof config.model !== "string") {
      errors.push("model must be a string");
    }

    if (config.userPromptTemplate !== undefined && typeof config.userPromptTemplate !== "string") {
      errors.push("userPromptTemplate must be a string");
    }

    if (config.temperature !== undefined) {
      const temp = config.temperature as number;
      if (typeof temp !== "number" || temp < 0 || temp > 2) {
        errors.push("temperature must be a number between 0 and 2");
      }
    }

    if (config.maxTokens !== undefined) {
      const tokens = config.maxTokens as number;
      if (typeof tokens !== "number" || tokens < 1 || tokens > 100000) {
        errors.push("maxTokens must be a number between 1 and 100000");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
