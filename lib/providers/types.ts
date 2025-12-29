export interface LLMConfig {
  provider: "openai" | "anthropic";
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface OutputSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface LLMProvider {
  name: string;
  executePrompt(
    messages: PromptMessage[],
    config: LLMConfig,
    outputSchema?: OutputSchema
  ): Promise<LLMResponse>;
}
