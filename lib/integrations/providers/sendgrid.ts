import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class SendGridIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "sendgrid",
      name: "SendGrid",
      description: "Send transactional emails and manage email campaigns",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/sendgrid.svg",
      category: "communication",
      authType: "api_key",
      website: "https://sendgrid.com",
      docsUrl: "https://docs.sendgrid.com/api-reference",
      apiKey: {
        headerName: "Authorization",
        prefix: "Bearer",
        instructions: "Get your API key from SendGrid Settings > API Keys",
      },
    },
    actions: [
      {
        id: "send_email",
        name: "Send Email",
        description: "Send a transactional email",
        inputSchema: {
          to: {
            type: "string",
            description: "Recipient email address",
            required: true,
          },
          from: {
            type: "string",
            description: "Sender email address",
            required: true,
          },
          subject: {
            type: "string",
            description: "Email subject",
            required: true,
          },
          text: {
            type: "string",
            description: "Plain text content",
          },
          html: {
            type: "string",
            description: "HTML content",
          },
          template_id: {
            type: "string",
            description: "Dynamic template ID",
          },
          dynamic_template_data: {
            type: "object",
            description: "Data for dynamic template",
          },
        },
        outputSchema: {
          success: { type: "boolean" },
          message_id: { type: "string" },
        },
      },
      {
        id: "send_bulk_email",
        name: "Send Bulk Email",
        description: "Send email to multiple recipients",
        inputSchema: {
          to: {
            type: "array",
            description: "Array of recipient email addresses",
            required: true,
          },
          from: {
            type: "string",
            description: "Sender email address",
            required: true,
          },
          subject: {
            type: "string",
            description: "Email subject",
            required: true,
          },
          text: {
            type: "string",
            description: "Plain text content",
          },
          html: {
            type: "string",
            description: "HTML content",
          },
        },
        outputSchema: {
          success: { type: "boolean" },
          sent_count: { type: "number" },
        },
      },
      {
        id: "add_contact",
        name: "Add Contact",
        description: "Add a contact to a list",
        inputSchema: {
          email: {
            type: "string",
            description: "Contact email address",
            required: true,
          },
          first_name: {
            type: "string",
            description: "First name",
          },
          last_name: {
            type: "string",
            description: "Last name",
          },
          list_ids: {
            type: "array",
            description: "List IDs to add contact to",
          },
          custom_fields: {
            type: "object",
            description: "Custom field values",
          },
        },
        outputSchema: {
          job_id: { type: "string" },
        },
      },
      {
        id: "get_stats",
        name: "Get Email Stats",
        description: "Get email sending statistics",
        inputSchema: {
          start_date: {
            type: "string",
            description: "Start date (YYYY-MM-DD)",
            required: true,
          },
          end_date: {
            type: "string",
            description: "End date (YYYY-MM-DD)",
          },
          aggregated_by: {
            type: "string",
            description: "Aggregation period (day, week, month)",
            default: "day",
          },
        },
        outputSchema: {
          stats: { type: "array" },
        },
      },
    ],
  };

  private baseUrl = "https://api.sendgrid.com/v3";

  async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const { connection, input } = context;
    const credentials = connection.credentials;

    switch (actionId) {
      case "send_email":
        return this.sendEmail(credentials, input);
      case "send_bulk_email":
        return this.sendBulkEmail(credentials, input);
      case "add_contact":
        return this.addContact(credentials, input);
      case "get_stats":
        return this.getStats(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await fetch(`${this.baseUrl}/user/profile`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          metadata: {
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
          },
        };
      }

      return { valid: false, error: "Invalid API key" };
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

  private async sendEmail(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body: Record<string, unknown> = {
        personalizations: [
          {
            to: [{ email: input.to }],
          },
        ],
        from: { email: input.from },
        subject: input.subject,
      };

      if (input.template_id) {
        body.template_id = input.template_id;
        if (input.dynamic_template_data) {
          (body.personalizations as Array<Record<string, unknown>>)[0].dynamic_template_data =
            input.dynamic_template_data;
        }
      } else {
        body.content = [];
        if (input.text) {
          (body.content as Array<Record<string, string>>).push({
            type: "text/plain",
            value: input.text as string,
          });
        }
        if (input.html) {
          (body.content as Array<Record<string, string>>).push({
            type: "text/html",
            value: input.html as string,
          });
        }
      }

      const response = await fetch(`${this.baseUrl}/mail/send`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: JSON.stringify(body),
      });

      if (response.status === 202) {
        const messageId = response.headers.get("X-Message-Id");
        return createActionResult(true, {
          success: true,
          message_id: messageId,
        });
      }

      const data = await response.json();
      return createActionResult(false, data.errors?.[0]?.message || "Failed to send email");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async sendBulkEmail(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const recipients = input.to as string[];
      const body = {
        personalizations: recipients.map((email) => ({
          to: [{ email }],
        })),
        from: { email: input.from },
        subject: input.subject,
        content: [] as Array<Record<string, string>>,
      };

      if (input.text) {
        body.content.push({ type: "text/plain", value: input.text as string });
      }
      if (input.html) {
        body.content.push({ type: "text/html", value: input.html as string });
      }

      const response = await fetch(`${this.baseUrl}/mail/send`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: JSON.stringify(body),
      });

      if (response.status === 202) {
        return createActionResult(true, {
          success: true,
          sent_count: recipients.length,
        });
      }

      const data = await response.json();
      return createActionResult(false, data.errors?.[0]?.message || "Failed to send emails");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async addContact(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const contact: Record<string, unknown> = {
        email: input.email,
      };

      if (input.first_name) contact.first_name = input.first_name;
      if (input.last_name) contact.last_name = input.last_name;
      if (input.custom_fields) contact.custom_fields = input.custom_fields;

      const body: Record<string, unknown> = {
        contacts: [contact],
      };

      if (input.list_ids) {
        body.list_ids = input.list_ids;
      }

      const response = await fetch(`${this.baseUrl}/marketing/contacts`, {
        method: "PUT",
        headers: this.getHeaders(credentials),
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, { job_id: data.job_id });
      }

      return createActionResult(false, data.errors?.[0]?.message || "Failed to add contact");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async getStats(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const params = new URLSearchParams({
        start_date: input.start_date as string,
        aggregated_by: (input.aggregated_by as string) || "day",
      });

      if (input.end_date) {
        params.set("end_date", input.end_date as string);
      }

      const response = await fetch(`${this.baseUrl}/stats?${params}`, {
        headers: this.getHeaders(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, { stats: data });
      }

      return createActionResult(false, data.errors?.[0]?.message || "Failed to get stats");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
