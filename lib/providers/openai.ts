import OpenAI from "openai";
import type { LLMProvider, LLMConfig, PromptMessage, LLMResponse, OutputSchema } from "./types";

// Models that support structured outputs (json_schema) - strictest JSON support
const STRUCTURED_OUTPUT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4o-2024",
  "gpt-4-turbo",
];

// Models that support json_object response format
const JSON_OBJECT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4-1106",
  "gpt-4-0125",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-0125",
];

// Deprecated models - replace with gpt-4o-mini (affordable and capable)
const DEPRECATED_MODEL_REPLACEMENTS: Record<string, string> = {
  "text-davinci-003": "gpt-4o-mini",
  "text-davinci-002": "gpt-4o-mini",
  "text-davinci-001": "gpt-4o-mini",
  "text-curie-001": "gpt-4o-mini",
  "text-babbage-001": "gpt-4o-mini",
  "text-ada-001": "gpt-4o-mini",
  "code-davinci-002": "gpt-4o",
  "code-cushman-001": "gpt-4o-mini",
  "gpt-3.5-turbo-0301": "gpt-4o-mini",
  "gpt-3.5-turbo-0613": "gpt-4o-mini",
  "gpt-3.5-turbo": "gpt-4o-mini", // Old versions don't support JSON mode
  "gpt-4-0314": "gpt-4o",
  "gpt-4-0613": "gpt-4o",
  "gpt-4-32k": "gpt-4o",
  "gpt-4-32k-0314": "gpt-4o",
  "gpt-4-32k-0613": "gpt-4o",
  "gpt-4": "gpt-4o", // Base gpt-4 doesn't support JSON mode well
};

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  private supportsStructuredOutput(model: string): boolean {
    return STRUCTURED_OUTPUT_MODELS.some(
      (supported) => model.toLowerCase().startsWith(supported.toLowerCase())
    );
  }

  private supportsJsonObject(model: string): boolean {
    return JSON_OBJECT_MODELS.some(
      (supported) => model.toLowerCase().startsWith(supported.toLowerCase())
    );
  }

  async executePrompt(
    messages: PromptMessage[],
    config: LLMConfig,
    outputSchema?: OutputSchema
  ): Promise<LLMResponse> {
    let model = config.model || "gpt-4o";

    // Auto-replace deprecated models with modern equivalents
    if (DEPRECATED_MODEL_REPLACEMENTS[model]) {
      console.warn(`Model "${model}" is deprecated. Automatically using "${DEPRECATED_MODEL_REPLACEMENTS[model]}" instead.`);
      model = DEPRECATED_MODEL_REPLACEMENTS[model];
    }

    const openaiMessages = messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model,
      messages: openaiMessages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 16384,
    };

    if (outputSchema) {
      // Add JSON schema instruction to messages for all approaches
      const schemaInstruction = `\n\nIMPORTANT: You must respond with valid JSON only, no other text. The JSON must match this schema:\n${JSON.stringify(outputSchema, null, 2)}`;

      const systemIndex = openaiMessages.findIndex((m) => m.role === "system");
      if (systemIndex >= 0) {
        openaiMessages[systemIndex].content += schemaInstruction;
      } else {
        openaiMessages.unshift({
          role: "system",
          content: `You are a helpful assistant. Respond only with valid JSON, no other text.${schemaInstruction}`,
        });
      }
      requestParams.messages = openaiMessages;

      if (this.supportsStructuredOutput(model)) {
        // Tier 1: Use structured outputs for modern models (best reliability)
        const normalizedSchema = this.normalizeSchemaForOpenAI(outputSchema);
        requestParams.response_format = {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: normalizedSchema,
            strict: true,
          },
        };
      } else if (this.supportsJsonObject(model)) {
        // Tier 2: Use json_object for compatible models
        requestParams.response_format = { type: "json_object" };
      }
      // Tier 3: For unsupported models, rely on prompt instructions only (no response_format)
    }

    const response = await this.client.chat.completions.create(requestParams);

    const choice = response.choices[0];
    if (!choice || !choice.message.content) {
      throw new Error("No response from OpenAI");
    }

    return {
      content: choice.message.content,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  private normalizeSchemaForOpenAI(schema: OutputSchema | Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...schema };

    if (normalized.type === "object") {
      normalized.additionalProperties = false;

      if (normalized.properties && typeof normalized.properties === "object") {
        const properties = normalized.properties as Record<string, unknown>;
        const normalizedProperties: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(properties)) {
          if (value && typeof value === "object") {
            normalizedProperties[key] = this.normalizeSchemaForOpenAI(value as Record<string, unknown>);
          } else {
            normalizedProperties[key] = value;
          }
        }

        normalized.properties = normalizedProperties;

        const allPropertyKeys = Object.keys(normalizedProperties);
        if (allPropertyKeys.length > 0) {
          normalized.required = allPropertyKeys;
        }
      }
    }

    if (normalized.type === "array" && normalized.items) {
      if (typeof normalized.items === "object") {
        normalized.items = this.normalizeSchemaForOpenAI(normalized.items as Record<string, unknown>);
      }
    }

    for (const keyword of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(normalized[keyword])) {
        normalized[keyword] = (normalized[keyword] as Record<string, unknown>[]).map(
          (item) => this.normalizeSchemaForOpenAI(item)
        );
      }
    }

    return normalized;
  }
}
