import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import type { LLMProvider, LLMConfig, PromptMessage, LLMResponse, OutputSchema } from "./types";

export type { LLMProvider, LLMConfig, PromptMessage, LLMResponse, OutputSchema };

const providers: Record<string, LLMProvider> = {};

export function getProvider(name: "openai" | "anthropic"): LLMProvider {
  if (!providers[name]) {
    switch (name) {
      case "openai":
        providers[name] = new OpenAIProvider();
        break;
      case "anthropic":
        providers[name] = new AnthropicProvider();
        break;
      default:
        throw new Error(`Unknown provider: ${name}`);
    }
  }
  return providers[name];
}

export async function executePrompt(
  provider: "openai" | "anthropic",
  config: Omit<LLMConfig, "provider">,
  prompt: PromptMessage[],
  schema?: OutputSchema
): Promise<Record<string, unknown>> {
  const llmProvider = getProvider(provider);

  const fullConfig: LLMConfig = {
    ...config,
    provider,
  };

  // If no schema provided, just get raw response
  if (!schema) {
    const response = await llmProvider.executePrompt(prompt, fullConfig);
    const content = response.content.trim();

    // Try to parse as JSON if it looks like JSON
    if ((content.startsWith("{") && content.endsWith("}")) ||
        (content.startsWith("[") && content.endsWith("]"))) {
      try {
        return JSON.parse(content);
      } catch {
        // Not valid JSON, return as text
      }
    }

    return { response: content, text: content };
  }

  // With schema, enforce JSON response
  const maxRetries = 3;
  let lastError: Error | null = null;
  let lastContent: string = "";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await llmProvider.executePrompt(prompt, fullConfig, schema);
      let content = response.content.trim();
      lastContent = content;

      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        content = jsonMatch[1].trim();
      }

      // Try to repair common JSON issues
      content = repairJson(content);

      const parsed = JSON.parse(content);
      validateAgainstSchema(parsed, schema);

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry API errors (auth, rate limit, etc.)
      if (lastError.message.includes("401") || lastError.message.includes("403") ||
          lastError.message.includes("429") || lastError.message.includes("API key") ||
          lastError.message.includes("quota")) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        // Create a more helpful retry prompt based on the error
        let retryInstruction = "";

        if (lastError.message.includes("Unexpected end") ||
            lastError.message.includes("Unterminated") ||
            lastError.message.includes("position")) {
          // JSON was truncated - ask for shorter response
          retryInstruction = `Your response was too long and got cut off. Please provide a SHORTER, COMPLETE JSON response. Use brief values (max 100 characters per string field). Remove unnecessary details.`;
        } else if (lastError.message.includes("Missing required field")) {
          retryInstruction = `Your response was missing required fields. ${lastError.message}. Please include ALL required fields in your JSON response.`;
        } else {
          retryInstruction = `Your previous response was invalid JSON. Error: ${lastError.message}. Please provide valid JSON only, no other text.`;
        }

        const retryPrompt: PromptMessage = {
          role: "user",
          content: retryInstruction,
        };
        prompt.push(retryPrompt);
      }
    }
  }

  // Provide helpful error message
  let errorMessage = `Failed to get valid JSON response after ${maxRetries} attempts.`;

  if (lastError?.message.includes("Unexpected end") ||
      lastError?.message.includes("Unterminated") ||
      lastContent.length > 5000) {
    errorMessage = `The AI response was too long and incomplete. To fix this: 1) Simplify your output schema (fewer fields), 2) Ask for shorter/summarized content in your prompt, 3) Process data in smaller batches.`;
  } else if (lastError) {
    errorMessage += ` Last error: ${lastError.message}`;
  }

  throw new Error(errorMessage);
}

/**
 * Attempt to repair common JSON issues
 */
function repairJson(content: string): string {
  let json = content.trim();

  // Remove any leading/trailing non-JSON content
  const firstBrace = json.indexOf("{");
  const firstBracket = json.indexOf("[");
  const start = firstBrace === -1 ? firstBracket :
                firstBracket === -1 ? firstBrace :
                Math.min(firstBrace, firstBracket);

  if (start > 0) {
    json = json.slice(start);
  }

  // Find the matching closing brace/bracket
  if (json.startsWith("{")) {
    const lastBrace = json.lastIndexOf("}");
    if (lastBrace > 0) {
      json = json.slice(0, lastBrace + 1);
    }
  } else if (json.startsWith("[")) {
    const lastBracket = json.lastIndexOf("]");
    if (lastBracket > 0) {
      json = json.slice(0, lastBracket + 1);
    }
  }

  // Try to fix truncated JSON by closing open structures
  if (!isValidJson(json)) {
    json = attemptJsonCompletion(json);
  }

  return json;
}

/**
 * Check if string is valid JSON
 */
function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempt to complete truncated JSON by adding missing closing characters
 */
function attemptJsonCompletion(json: string): string {
  // Count open brackets and braces
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const char of json) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") openBraces++;
      if (char === "}") openBraces--;
      if (char === "[") openBrackets++;
      if (char === "]") openBrackets--;
    }
  }

  // If we're in a string, close it
  if (inString) {
    json += '"';
  }

  // Remove trailing comma if present
  json = json.replace(/,\s*$/, "");

  // Close any open structures
  while (openBrackets > 0) {
    json += "]";
    openBrackets--;
  }
  while (openBraces > 0) {
    json += "}";
    openBraces--;
  }

  return json;
}

function validateAgainstSchema(data: unknown, schema: OutputSchema): void {
  if (typeof data !== "object" || data === null) {
    throw new Error("Response must be an object");
  }

  const obj = data as Record<string, unknown>;

  for (const required of schema.required || []) {
    if (!(required in obj)) {
      throw new Error(`Missing required field: ${required}`);
    }
  }

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (key in obj) {
      const value = obj[key];
      const expectedType = propSchema.type;

      if (expectedType === "string" && typeof value !== "string") {
        throw new Error(`Field ${key} must be a string`);
      }
      if (expectedType === "number" && typeof value !== "number") {
        throw new Error(`Field ${key} must be a number`);
      }
      if (expectedType === "boolean" && typeof value !== "boolean") {
        throw new Error(`Field ${key} must be a boolean`);
      }
      if (expectedType === "array" && !Array.isArray(value)) {
        throw new Error(`Field ${key} must be an array`);
      }
    }
  }
}
