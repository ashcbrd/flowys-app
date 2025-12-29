import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMConfig, PromptMessage, LLMResponse, OutputSchema } from "./types";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async executePrompt(
    messages: PromptMessage[],
    config: LLMConfig,
    outputSchema?: OutputSchema
  ): Promise<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    let userPrompt = nonSystemMessages[nonSystemMessages.length - 1]?.content || "";

    if (outputSchema) {
      userPrompt += `\n\nYou must respond with valid JSON matching this schema:\n${JSON.stringify(outputSchema, null, 2)}\n\nRespond ONLY with the JSON, no other text.`;
    }

    if (nonSystemMessages.length > 0) {
      nonSystemMessages[nonSystemMessages.length - 1].content = userPrompt;
    }

    const response = await this.client.messages.create({
      model: config.model || "claude-sonnet-4-20250514",
      max_tokens: config.maxTokens ?? 16384,
      system: systemMessage?.content,
      messages: nonSystemMessages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Anthropic");
    }

    return {
      content: textBlock.text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
