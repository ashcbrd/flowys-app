import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class TwilioIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "twilio",
      name: "Twilio",
      description: "Send SMS, make calls, and manage communications",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/twilio.svg",
      category: "communication",
      authType: "basic_auth",
      website: "https://twilio.com",
      docsUrl: "https://www.twilio.com/docs/usage/api",
      basicAuth: {
        usernameLabel: "Account SID",
        passwordLabel: "Auth Token",
        instructions: "Find your Account SID and Auth Token in the Twilio Console",
      },
    },
    actions: [
      {
        id: "send_sms",
        name: "Send SMS",
        description: "Send an SMS message",
        inputSchema: {
          to: {
            type: "string",
            description: "Recipient phone number (E.164 format)",
            required: true,
          },
          from: {
            type: "string",
            description: "Sender phone number (your Twilio number)",
            required: true,
          },
          body: {
            type: "string",
            description: "Message text",
            required: true,
          },
          media_url: {
            type: "string",
            description: "URL of media to send (MMS)",
          },
        },
        outputSchema: {
          sid: { type: "string" },
          status: { type: "string" },
          date_sent: { type: "string" },
        },
      },
      {
        id: "make_call",
        name: "Make Call",
        description: "Initiate a phone call",
        inputSchema: {
          to: {
            type: "string",
            description: "Recipient phone number",
            required: true,
          },
          from: {
            type: "string",
            description: "Caller phone number (your Twilio number)",
            required: true,
          },
          twiml: {
            type: "string",
            description: "TwiML instructions for the call",
          },
          url: {
            type: "string",
            description: "URL returning TwiML instructions",
          },
        },
        outputSchema: {
          sid: { type: "string" },
          status: { type: "string" },
        },
      },
      {
        id: "send_whatsapp",
        name: "Send WhatsApp Message",
        description: "Send a WhatsApp message",
        inputSchema: {
          to: {
            type: "string",
            description: "Recipient WhatsApp number (E.164 format)",
            required: true,
          },
          from: {
            type: "string",
            description: "Your WhatsApp-enabled Twilio number",
            required: true,
          },
          body: {
            type: "string",
            description: "Message text",
            required: true,
          },
        },
        outputSchema: {
          sid: { type: "string" },
          status: { type: "string" },
        },
      },
      {
        id: "lookup_phone",
        name: "Lookup Phone Number",
        description: "Get information about a phone number",
        inputSchema: {
          phone_number: {
            type: "string",
            description: "Phone number to lookup",
            required: true,
          },
          type: {
            type: "array",
            description: "Lookup types (carrier, caller-name)",
          },
        },
        outputSchema: {
          phone_number: { type: "string" },
          country_code: { type: "string" },
          carrier: { type: "object" },
          caller_name: { type: "object" },
        },
      },
      {
        id: "list_messages",
        name: "List Messages",
        description: "List sent and received messages",
        inputSchema: {
          to: {
            type: "string",
            description: "Filter by recipient",
          },
          from: {
            type: "string",
            description: "Filter by sender",
          },
          date_sent: {
            type: "string",
            description: "Filter by date (YYYY-MM-DD)",
          },
          limit: {
            type: "number",
            description: "Maximum results",
            default: 20,
          },
        },
        outputSchema: {
          messages: { type: "array" },
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
      case "send_sms":
        return this.sendSms(credentials, input);
      case "make_call":
        return this.makeCall(credentials, input);
      case "send_whatsapp":
        return this.sendWhatsApp(credentials, input);
      case "lookup_phone":
        return this.lookupPhone(credentials, input);
      case "list_messages":
        return this.listMessages(credentials, input);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const { username: accountSid, password: authToken } = credentials;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
        {
          headers: { Authorization: `Basic ${auth}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          metadata: {
            accountSid: data.sid,
            friendlyName: data.friendly_name,
            status: data.status,
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

  private getAuth(credentials: ConnectionCredentials): string {
    const { username: accountSid, password: authToken } = credentials;
    return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  }

  private getBaseUrl(credentials: ConnectionCredentials): string {
    return `https://api.twilio.com/2010-04-01/Accounts/${credentials.username}`;
  }

  private async sendSms(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body = new URLSearchParams({
        To: input.to as string,
        From: input.from as string,
        Body: input.body as string,
      });

      if (input.media_url) {
        body.set("MediaUrl", input.media_url as string);
      }

      const response = await fetch(`${this.getBaseUrl(credentials)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.getAuth(credentials)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          sid: data.sid,
          status: data.status,
          date_sent: data.date_sent,
        });
      }

      return createActionResult(false, data.message || "Failed to send SMS");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async makeCall(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body = new URLSearchParams({
        To: input.to as string,
        From: input.from as string,
      });

      if (input.twiml) {
        body.set("Twiml", input.twiml as string);
      } else if (input.url) {
        body.set("Url", input.url as string);
      }

      const response = await fetch(`${this.getBaseUrl(credentials)}/Calls.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.getAuth(credentials)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          sid: data.sid,
          status: data.status,
        });
      }

      return createActionResult(false, data.message || "Failed to make call");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async sendWhatsApp(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const to = (input.to as string).startsWith("whatsapp:")
        ? input.to
        : `whatsapp:${input.to}`;
      const from = (input.from as string).startsWith("whatsapp:")
        ? input.from
        : `whatsapp:${input.from}`;

      const body = new URLSearchParams({
        To: to as string,
        From: from as string,
        Body: input.body as string,
      });

      const response = await fetch(`${this.getBaseUrl(credentials)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.getAuth(credentials)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          sid: data.sid,
          status: data.status,
        });
      }

      return createActionResult(false, data.message || "Failed to send WhatsApp message");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async lookupPhone(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const phone = encodeURIComponent(input.phone_number as string);
      let url = `https://lookups.twilio.com/v1/PhoneNumbers/${phone}`;

      if (input.type && Array.isArray(input.type) && input.type.length > 0) {
        url += `?Type=${(input.type as string[]).join("&Type=")}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Basic ${this.getAuth(credentials)}` },
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          phone_number: data.phone_number,
          country_code: data.country_code,
          carrier: data.carrier,
          caller_name: data.caller_name,
        });
      }

      return createActionResult(false, data.message || "Failed to lookup phone");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async listMessages(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const params = new URLSearchParams();
      if (input.to) params.set("To", input.to as string);
      if (input.from) params.set("From", input.from as string);
      if (input.date_sent) params.set("DateSent", input.date_sent as string);
      params.set("PageSize", String(input.limit || 20));

      const response = await fetch(
        `${this.getBaseUrl(credentials)}/Messages.json?${params}`,
        {
          headers: { Authorization: `Basic ${this.getAuth(credentials)}` },
        }
      );

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          messages: data.messages.map((msg: Record<string, unknown>) => ({
            sid: msg.sid,
            to: msg.to,
            from: msg.from,
            body: msg.body,
            status: msg.status,
            date_sent: msg.date_sent,
          })),
        });
      }

      return createActionResult(false, data.message || "Failed to list messages");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
