import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class DiscordIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "discord",
      name: "Discord",
      description: "Send messages, manage channels, and interact with Discord servers",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/discord.svg",
      category: "communication",
      authType: "oauth2",
      website: "https://discord.com",
      docsUrl: "https://discord.com/developers/docs",
      oauth2: {
        authorizationUrl: "https://discord.com/api/oauth2/authorize",
        tokenUrl: "https://discord.com/api/oauth2/token",
        scopes: ["bot", "guilds", "messages.read"],
      },
    },
    actions: [
      {
        id: "send_message",
        name: "Send Message",
        description: "Send a message to a Discord channel",
        inputSchema: {
          channelId: {
            type: "string",
            description: "Discord channel ID",
            required: true,
          },
          content: {
            type: "string",
            description: "Message content",
            required: true,
          },
          embeds: {
            type: "array",
            description: "Optional rich embeds",
          },
        },
        outputSchema: {
          id: { type: "string" },
          channelId: { type: "string" },
          timestamp: { type: "string" },
        },
      },
      {
        id: "create_channel",
        name: "Create Channel",
        description: "Create a new channel in a Discord server",
        inputSchema: {
          guildId: {
            type: "string",
            description: "Server (guild) ID",
            required: true,
          },
          name: {
            type: "string",
            description: "Channel name",
            required: true,
          },
          type: {
            type: "number",
            description: "Channel type (0=text, 2=voice)",
            default: 0,
          },
        },
        outputSchema: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "number" },
        },
      },
      {
        id: "list_guilds",
        name: "List Servers",
        description: "Get a list of servers the bot is in",
        inputSchema: {},
        outputSchema: {
          guilds: { type: "array" },
        },
      },
      {
        id: "add_reaction",
        name: "Add Reaction",
        description: "Add a reaction to a message",
        inputSchema: {
          channelId: {
            type: "string",
            description: "Channel ID",
            required: true,
          },
          messageId: {
            type: "string",
            description: "Message ID",
            required: true,
          },
          emoji: {
            type: "string",
            description: "Emoji (unicode or custom format)",
            required: true,
          },
        },
        outputSchema: {
          success: { type: "boolean" },
        },
      },
    ],
  };

  private baseUrl = "https://discord.com/api/v10";

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
      case "list_guilds":
        return this.listGuilds(credentials);
      case "add_reaction":
        return this.addReaction(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await fetch(`${this.baseUrl}/users/@me`, {
        headers: { Authorization: `Bot ${credentials.accessToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          metadata: {
            botId: data.id,
            username: data.username,
            discriminator: data.discriminator,
          },
        };
      }

      return { valid: false, error: "Invalid bot token" };
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
      const response = await fetch(
        `${this.baseUrl}/channels/${input.channelId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: input.content,
            embeds: input.embeds,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          channelId: data.channel_id,
          timestamp: data.timestamp,
        });
      }

      return createActionResult(false, data.message || "Failed to send message");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createChannel(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/guilds/${input.guildId}/channels`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: input.name,
            type: input.type || 0,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          name: data.name,
          type: data.type,
        });
      }

      return createActionResult(false, data.message || "Failed to create channel");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async listGuilds(credentials: ConnectionCredentials): Promise<ActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/users/@me/guilds`, {
        headers: { Authorization: `Bot ${credentials.accessToken}` },
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          guilds: data.map((g: Record<string, unknown>) => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
          })),
        });
      }

      return createActionResult(false, data.message || "Failed to list guilds");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async addReaction(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const emoji = encodeURIComponent(input.emoji as string);
      const response = await fetch(
        `${this.baseUrl}/channels/${input.channelId}/messages/${input.messageId}/reactions/${emoji}/@me`,
        {
          method: "PUT",
          headers: { Authorization: `Bot ${credentials.accessToken}` },
        }
      );

      if (response.status === 204) {
        return createActionResult(true, { success: true });
      }

      const data = await response.json();
      return createActionResult(false, data.message || "Failed to add reaction");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
