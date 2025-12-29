import { BaseIntegration, createActionResult } from "../base";
import type { IntegrationDefinition, ActionContext, ActionResult, ConnectionCredentials } from "../types";

export class AirtableIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "airtable",
      name: "Airtable",
      description: "Read and write data to Airtable bases",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/airtable.svg",
      category: "data",
      authType: "api_key",
      website: "https://airtable.com",
      docsUrl: "https://airtable.com/developers/web/api",
      apiKey: {
        headerName: "Authorization",
        prefix: "Bearer",
        instructions: "Get your API key from Airtable Account settings",
      },
    },
    actions: [
      {
        id: "list_records",
        name: "List Records",
        description: "List records from an Airtable table",
        inputSchema: {
          baseId: { type: "string", required: true },
          tableId: { type: "string", required: true },
          maxRecords: { type: "number", default: 100 },
          view: { type: "string" },
        },
        outputSchema: { records: { type: "array" } },
      },
      {
        id: "create_record",
        name: "Create Record",
        description: "Create a new record in an Airtable table",
        inputSchema: {
          baseId: { type: "string", required: true },
          tableId: { type: "string", required: true },
          fields: { type: "object", required: true },
        },
        outputSchema: { id: { type: "string" }, fields: { type: "object" } },
      },
      {
        id: "update_record",
        name: "Update Record",
        description: "Update an existing record",
        inputSchema: {
          baseId: { type: "string", required: true },
          tableId: { type: "string", required: true },
          recordId: { type: "string", required: true },
          fields: { type: "object", required: true },
        },
        outputSchema: { id: { type: "string" }, fields: { type: "object" } },
      },
    ],
  };

  async executeAction(actionId: string, context: ActionContext): Promise<ActionResult> {
    const { connection, input } = context;
    const apiKey = connection.credentials.apiKey;
    const baseUrl = `https://api.airtable.com/v0/${input.baseId}/${input.tableId}`;
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    try {
      let response: Response;
      switch (actionId) {
        case "list_records":
          response = await fetch(`${baseUrl}?maxRecords=${input.maxRecords || 100}`, { headers });
          break;
        case "create_record":
          response = await fetch(baseUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ fields: input.fields }),
          });
          break;
        case "update_record":
          response = await fetch(`${baseUrl}/${input.recordId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ fields: input.fields }),
          });
          break;
        default:
          return createActionResult(false, `Unknown action: ${actionId}`);
      }

      const data = await response.json();
      return response.ok ? createActionResult(true, data) : createActionResult(false, data.error?.message || "Request failed");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  async validateCredentials(credentials: ConnectionCredentials) {
    try {
      const response = await fetch("https://api.airtable.com/v0/meta/whoami", {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        return { valid: true, metadata: { userId: data.id } };
      }
      return { valid: false, error: "Invalid API key" };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : "Validation failed" };
    }
  }
}
