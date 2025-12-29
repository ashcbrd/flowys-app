import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class SlackIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "slack",
      name: "Slack",
      description: "Send messages, create channels, and manage your Slack workspace",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg",
      category: "communication",
      authType: "oauth2",
      website: "https://slack.com",
      docsUrl: "https://api.slack.com/docs",
      oauth2: {
        authorizationUrl: "https://slack.com/oauth/v2/authorize",
        tokenUrl: "https://slack.com/api/oauth.v2.access",
        scopes: [
          "channels:read",
          "channels:write",
          "chat:write",
          "users:read",
          "files:write",
        ],
        scopeDelimiter: ",",
      },
    },
    actions: [
      {
        id: "send_message",
        name: "Send Message",
        description: "Send a message to a Slack channel or user",
        inputSchema: {
          channel: {
            type: "string",
            description: "Channel ID or name (e.g., #general or C01234567)",
            required: true,
          },
          text: {
            type: "string",
            description: "Message text (supports Slack markdown)",
            required: true,
          },
          blocks: {
            type: "array",
            description: "Optional Block Kit blocks for rich formatting",
            required: false,
          },
        },
        outputSchema: {
          ok: { type: "boolean" },
          ts: { type: "string", description: "Message timestamp ID" },
          channel: { type: "string" },
        },
      },
      {
        id: "create_channel",
        name: "Create Channel",
        description: "Create a new Slack channel",
        inputSchema: {
          name: {
            type: "string",
            description: "Channel name (lowercase, no spaces)",
            required: true,
          },
          is_private: {
            type: "boolean",
            description: "Whether the channel is private",
            default: false,
          },
        },
        outputSchema: {
          ok: { type: "boolean" },
          channel: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
          },
        },
      },
      {
        id: "list_channels",
        name: "List Channels",
        description: "Get a list of channels in the workspace",
        inputSchema: {
          limit: {
            type: "number",
            description: "Maximum number of channels to return",
            default: 100,
          },
        },
        outputSchema: {
          ok: { type: "boolean" },
          channels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                is_private: { type: "boolean" },
              },
            },
          },
        },
      },
      {
        id: "upload_file",
        name: "Upload File",
        description: "Upload a file to a Slack channel",
        inputSchema: {
          channel: {
            type: "string",
            description: "Channel to upload to",
            required: true,
          },
          content: {
            type: "string",
            description: "File content (text)",
            required: true,
          },
          filename: {
            type: "string",
            description: "Name for the file",
            required: true,
          },
          title: {
            type: "string",
            description: "Title for the file",
          },
        },
        outputSchema: {
          ok: { type: "boolean" },
          file: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
          },
        },
      },
    ],
  };

  async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const { connection, input } = context;
    const credentials = connection.credentials;

    switch (actionId) {
      case "send_message":
        return this.sendMessage(credentials, input);
      case "create_channel":
        return this.createChannel(credentials, input);
      case "list_channels":
        return this.listChannels(credentials, input);
      case "upload_file":
        return this.uploadFile(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await this.makeRequest(
        "https://slack.com/api/auth.test",
        { method: "POST" },
        credentials
      );

      const data = await response.json();

      if (data.ok) {
        return {
          valid: true,
          metadata: {
            team: data.team,
            teamId: data.team_id,
            user: data.user,
            userId: data.user_id,
          },
        };
      }

      return { valid: false, error: data.error || "Invalid credentials" };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  private async sendMessage(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await this.makeRequest(
        "https://slack.com/api/chat.postMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: input.channel,
            text: input.text,
            blocks: input.blocks,
          }),
        },
        credentials
      );

      const data = await response.json();

      if (data.ok) {
        return createActionResult(true, {
          ok: true,
          ts: data.ts,
          channel: data.channel,
        });
      }

      return createActionResult(false, data.error || "Failed to send message");
    } catch (error) {
      return createActionResult(
        false,
        error instanceof Error ? error.message : "Request failed"
      );
    }
  }

  private async createChannel(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await this.makeRequest(
        "https://slack.com/api/conversations.create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            is_private: input.is_private || false,
          }),
        },
        credentials
      );

      const data = await response.json();

      if (data.ok) {
        return createActionResult(true, {
          ok: true,
          channel: {
            id: data.channel.id,
            name: data.channel.name,
          },
        });
      }

      return createActionResult(false, data.error || "Failed to create channel");
    } catch (error) {
      return createActionResult(
        false,
        error instanceof Error ? error.message : "Request failed"
      );
    }
  }

  private async listChannels(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const limit = (input.limit as number) || 100;
      const response = await this.makeRequest(
        `https://slack.com/api/conversations.list?limit=${limit}`,
        { method: "GET" },
        credentials
      );

      const data = await response.json();

      if (data.ok) {
        return createActionResult(true, {
          ok: true,
          channels: data.channels.map((ch: Record<string, unknown>) => ({
            id: ch.id,
            name: ch.name,
            is_private: ch.is_private,
          })),
        });
      }

      return createActionResult(false, data.error || "Failed to list channels");
    } catch (error) {
      return createActionResult(
        false,
        error instanceof Error ? error.message : "Request failed"
      );
    }
  }

  private async uploadFile(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const formData = new FormData();
      formData.append("channels", input.channel as string);
      formData.append("content", input.content as string);
      formData.append("filename", input.filename as string);
      if (input.title) formData.append("title", input.title as string);

      const response = await fetch("https://slack.com/api/files.upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.ok) {
        return createActionResult(true, {
          ok: true,
          file: {
            id: data.file.id,
            name: data.file.name,
          },
        });
      }

      return createActionResult(false, data.error || "Failed to upload file");
    } catch (error) {
      return createActionResult(
        false,
        error instanceof Error ? error.message : "Request failed"
      );
    }
  }
}
