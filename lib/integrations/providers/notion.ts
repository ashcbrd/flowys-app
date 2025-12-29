import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class NotionIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "notion",
      name: "Notion",
      description: "Create pages, manage databases, and organize your Notion workspace",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/notion.svg",
      category: "productivity",
      authType: "oauth2",
      website: "https://notion.so",
      docsUrl: "https://developers.notion.com",
      oauth2: {
        authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        scopes: [],
      },
    },
    actions: [
      {
        id: "create_page",
        name: "Create Page",
        description: "Create a new page in Notion",
        inputSchema: {
          parentId: {
            type: "string",
            description: "Parent page or database ID",
            required: true,
          },
          title: {
            type: "string",
            description: "Page title",
            required: true,
          },
          content: {
            type: "string",
            description: "Page content (markdown supported)",
          },
        },
        outputSchema: {
          id: { type: "string" },
          url: { type: "string" },
        },
      },
      {
        id: "query_database",
        name: "Query Database",
        description: "Query a Notion database",
        inputSchema: {
          databaseId: {
            type: "string",
            description: "Database ID",
            required: true,
          },
          filter: {
            type: "object",
            description: "Filter object (Notion filter format)",
          },
          pageSize: {
            type: "number",
            description: "Number of results (max 100)",
            default: 10,
          },
        },
        outputSchema: {
          results: { type: "array" },
          hasMore: { type: "boolean" },
        },
      },
      {
        id: "add_database_item",
        name: "Add Database Item",
        description: "Add a new item to a Notion database",
        inputSchema: {
          databaseId: {
            type: "string",
            description: "Database ID",
            required: true,
          },
          properties: {
            type: "object",
            description: "Properties for the new item",
            required: true,
          },
        },
        outputSchema: {
          id: { type: "string" },
          url: { type: "string" },
        },
      },
      {
        id: "search",
        name: "Search",
        description: "Search across Notion workspace",
        inputSchema: {
          query: {
            type: "string",
            description: "Search query",
            required: true,
          },
          filter: {
            type: "string",
            description: "Filter by object type (page or database)",
            enum: ["page", "database"],
          },
        },
        outputSchema: {
          results: { type: "array" },
        },
      },
    ],
  };

  private notionVersion = "2022-06-28";

  async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const { connection, input } = context;
    const credentials = connection.credentials;

    switch (actionId) {
      case "create_page":
        return this.createPage(credentials, input);
      case "query_database":
        return this.queryDatabase(credentials, input);
      case "add_database_item":
        return this.addDatabaseItem(credentials, input);
      case "search":
        return this.search(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await fetch("https://api.notion.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Notion-Version": this.notionVersion,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          metadata: {
            botId: data.id,
            workspaceName: data.bot?.workspace_name,
          },
        };
      }

      return { valid: false, error: "Invalid credentials" };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  }

  private async createPage(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body: Record<string, unknown> = {
        parent: { page_id: input.parentId },
        properties: {
          title: {
            title: [{ text: { content: input.title } }],
          },
        },
      };

      if (input.content) {
        body.children = [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: input.content } }],
            },
          },
        ];
      }

      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": this.notionVersion,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, { id: data.id, url: data.url });
      }

      return createActionResult(false, data.message || "Failed to create page");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async queryDatabase(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body: Record<string, unknown> = {
        page_size: input.pageSize || 10,
      };

      if (input.filter) {
        body.filter = input.filter;
      }

      const response = await fetch(
        `https://api.notion.com/v1/databases/${input.databaseId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
            "Notion-Version": this.notionVersion,
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          results: data.results,
          hasMore: data.has_more,
        });
      }

      return createActionResult(false, data.message || "Failed to query database");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async addDatabaseItem(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": this.notionVersion,
        },
        body: JSON.stringify({
          parent: { database_id: input.databaseId },
          properties: input.properties,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, { id: data.id, url: data.url });
      }

      return createActionResult(false, data.message || "Failed to add item");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async search(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body: Record<string, unknown> = {
        query: input.query,
      };

      if (input.filter) {
        body.filter = { property: "object", value: input.filter };
      }

      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": this.notionVersion,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, { results: data.results });
      }

      return createActionResult(false, data.message || "Search failed");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
