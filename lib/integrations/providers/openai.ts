import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class OpenAIIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "openai",
      name: "OpenAI",
      description: "Generate text, images, and embeddings using OpenAI's powerful AI models",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/openai.svg",
      category: "ai",
      authType: "api_key",
      website: "https://openai.com",
      docsUrl: "https://platform.openai.com/docs",
      apiKey: {
        headerName: "Authorization",
        prefix: "Bearer",
        instructions: "Get your API key from OpenAI Platform settings",
      },
    },
    actions: [
      {
        id: "chat_completion",
        name: "Chat Completion",
        description: "Generate a chat response using GPT models",
        inputSchema: {
          model: {
            type: "string",
            description: "Model to use (e.g., gpt-4, gpt-3.5-turbo)",
            default: "gpt-4",
          },
          messages: {
            type: "array",
            description: "Array of message objects with role and content",
            required: true,
          },
          temperature: {
            type: "number",
            description: "Sampling temperature (0-2)",
            default: 0.7,
          },
          max_tokens: {
            type: "number",
            description: "Maximum tokens in response",
          },
          system: {
            type: "string",
            description: "System message to prepend",
          },
        },
        outputSchema: {
          content: { type: "string" },
          role: { type: "string" },
          model: { type: "string" },
          usage: { type: "object" },
        },
      },
      {
        id: "generate_image",
        name: "Generate Image",
        description: "Generate images using DALL-E",
        inputSchema: {
          prompt: {
            type: "string",
            description: "Image description",
            required: true,
          },
          model: {
            type: "string",
            description: "Model to use (dall-e-2 or dall-e-3)",
            default: "dall-e-3",
          },
          size: {
            type: "string",
            description: "Image size (1024x1024, 1792x1024, 1024x1792)",
            default: "1024x1024",
          },
          quality: {
            type: "string",
            description: "Image quality (standard or hd)",
            default: "standard",
          },
          n: {
            type: "number",
            description: "Number of images to generate",
            default: 1,
          },
        },
        outputSchema: {
          images: { type: "array" },
        },
      },
      {
        id: "create_embedding",
        name: "Create Embedding",
        description: "Create vector embeddings for text",
        inputSchema: {
          input: {
            type: "string",
            description: "Text to embed",
            required: true,
          },
          model: {
            type: "string",
            description: "Embedding model",
            default: "text-embedding-3-small",
          },
        },
        outputSchema: {
          embedding: { type: "array" },
          dimensions: { type: "number" },
        },
      },
      {
        id: "transcribe_audio",
        name: "Transcribe Audio",
        description: "Transcribe audio to text using Whisper",
        inputSchema: {
          audio_url: {
            type: "string",
            description: "URL of audio file",
            required: true,
          },
          language: {
            type: "string",
            description: "Language code (optional)",
          },
          response_format: {
            type: "string",
            description: "Output format (json, text, srt, vtt)",
            default: "json",
          },
        },
        outputSchema: {
          text: { type: "string" },
          language: { type: "string" },
        },
      },
    ],
  };

  private baseUrl = "https://api.openai.com/v1";

  async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const { connection, input } = context;
    const credentials = connection.credentials;

    switch (actionId) {
      case "chat_completion":
        return this.chatCompletion(credentials, input);
      case "generate_image":
        return this.generateImage(credentials, input);
      case "create_embedding":
        return this.createEmbedding(credentials, input);
      case "transcribe_audio":
        return this.transcribeAudio(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });

      if (response.ok) {
        return {
          valid: true,
          metadata: { verified: true },
        };
      }

      const data = await response.json();
      return { valid: false, error: data.error?.message || "Invalid API key" };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  private getHeaders(credentials: ConnectionCredentials): HeadersInit {
    return {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async chatCompletion(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const messages = input.messages as Array<{ role: string; content: string }>;

      if (input.system) {
        messages.unshift({ role: "system", content: input.system as string });
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: JSON.stringify({
          model: input.model || "gpt-4",
          messages,
          temperature: input.temperature ?? 0.7,
          max_tokens: input.max_tokens,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const choice = data.choices[0];
        return createActionResult(true, {
          content: choice.message.content,
          role: choice.message.role,
          model: data.model,
          usage: data.usage,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to generate response");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async generateImage(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: JSON.stringify({
          model: input.model || "dall-e-3",
          prompt: input.prompt,
          size: input.size || "1024x1024",
          quality: input.quality || "standard",
          n: input.n || 1,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          images: data.data.map((img: { url?: string; b64_json?: string; revised_prompt?: string }) => ({
            url: img.url,
            b64_json: img.b64_json,
            revised_prompt: img.revised_prompt,
          })),
        });
      }

      return createActionResult(false, data.error?.message || "Failed to generate image");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createEmbedding(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: JSON.stringify({
          model: input.model || "text-embedding-3-small",
          input: input.input,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const embedding = data.data[0].embedding;
        return createActionResult(true, {
          embedding,
          dimensions: embedding.length,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to create embedding");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async transcribeAudio(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      // Fetch the audio file
      const audioResponse = await fetch(input.audio_url as string);
      const audioBlob = await audioResponse.blob();

      const formData = new FormData();
      formData.append("file", audioBlob, "audio.mp3");
      formData.append("model", "whisper-1");
      if (input.language) formData.append("language", input.language as string);
      formData.append("response_format", (input.response_format as string) || "json");

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          text: data.text,
          language: data.language,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to transcribe audio");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
