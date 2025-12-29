import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class GoogleSheetsIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "google-sheets",
      name: "Google Sheets",
      description: "Read, write, and manage Google Sheets spreadsheets",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlesheets.svg",
      category: "productivity",
      authType: "oauth2",
      website: "https://sheets.google.com",
      docsUrl: "https://developers.google.com/sheets/api",
      oauth2: {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive.readonly",
        ],
      },
    },
    actions: [
      {
        id: "read_range",
        name: "Read Range",
        description: "Read data from a spreadsheet range",
        inputSchema: {
          spreadsheetId: {
            type: "string",
            description: "The ID of the spreadsheet",
            required: true,
          },
          range: {
            type: "string",
            description: "The A1 notation range (e.g., Sheet1!A1:D10)",
            required: true,
          },
        },
        outputSchema: {
          values: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
          },
        },
      },
      {
        id: "write_range",
        name: "Write Range",
        description: "Write data to a spreadsheet range",
        inputSchema: {
          spreadsheetId: {
            type: "string",
            description: "The ID of the spreadsheet",
            required: true,
          },
          range: {
            type: "string",
            description: "The A1 notation range",
            required: true,
          },
          values: {
            type: "array",
            description: "2D array of values to write",
            required: true,
          },
        },
        outputSchema: {
          updatedCells: { type: "number" },
          updatedRows: { type: "number" },
          updatedColumns: { type: "number" },
        },
      },
      {
        id: "append_rows",
        name: "Append Rows",
        description: "Append rows to a spreadsheet",
        inputSchema: {
          spreadsheetId: {
            type: "string",
            description: "The ID of the spreadsheet",
            required: true,
          },
          range: {
            type: "string",
            description: "The range to append to (e.g., Sheet1!A:A)",
            required: true,
          },
          values: {
            type: "array",
            description: "2D array of row values to append",
            required: true,
          },
        },
        outputSchema: {
          updatedRows: { type: "number" },
          tableRange: { type: "string" },
        },
      },
      {
        id: "create_spreadsheet",
        name: "Create Spreadsheet",
        description: "Create a new Google Sheets spreadsheet",
        inputSchema: {
          title: {
            type: "string",
            description: "Title of the new spreadsheet",
            required: true,
          },
          sheets: {
            type: "array",
            description: "Optional list of sheet names to create",
          },
        },
        outputSchema: {
          spreadsheetId: { type: "string" },
          spreadsheetUrl: { type: "string" },
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
      case "read_range":
        return this.readRange(credentials, input);
      case "write_range":
        return this.writeRange(credentials, input);
      case "append_rows":
        return this.appendRows(credentials, input);
      case "create_spreadsheet":
        return this.createSpreadsheet(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await this.makeRequest(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { method: "GET" },
        credentials
      );

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          metadata: {
            email: data.email,
            name: data.name,
            picture: data.picture,
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

  async refreshTokens(
    credentials: ConnectionCredentials
  ): Promise<ConnectionCredentials | null> {
    if (!credentials.refreshToken) return null;

    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          refresh_token: credentials.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          ...credentials,
          accessToken: data.access_token,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
        };
      }
    } catch {
      // Refresh failed
    }

    return null;
  }

  private async readRange(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const { spreadsheetId, range } = input as { spreadsheetId: string; range: string };
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

      const response = await this.makeRequest(url, { method: "GET" }, credentials);
      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, { values: data.values || [] });
      }

      return createActionResult(false, data.error?.message || "Failed to read range");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async writeRange(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const { spreadsheetId, range, values } = input as {
        spreadsheetId: string;
        range: string;
        values: unknown[][];
      };

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

      const response = await this.makeRequest(
        url,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        },
        credentials
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          updatedCells: data.updatedCells,
          updatedRows: data.updatedRows,
          updatedColumns: data.updatedColumns,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to write range");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async appendRows(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const { spreadsheetId, range, values } = input as {
        spreadsheetId: string;
        range: string;
        values: unknown[][];
      };

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const response = await this.makeRequest(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        },
        credentials
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          updatedRows: data.updates?.updatedRows,
          tableRange: data.tableRange,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to append rows");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createSpreadsheet(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const { title, sheets } = input as { title: string; sheets?: string[] };

      const body: Record<string, unknown> = {
        properties: { title },
      };

      if (sheets && sheets.length > 0) {
        body.sheets = sheets.map((name) => ({
          properties: { title: name },
        }));
      }

      const response = await this.makeRequest(
        "https://sheets.googleapis.com/v4/spreadsheets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        credentials
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          spreadsheetId: data.spreadsheetId,
          spreadsheetUrl: data.spreadsheetUrl,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to create spreadsheet");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
