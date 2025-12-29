import { BaseIntegration, createActionResult } from "../base";
import type {
  IntegrationDefinition,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "../types";

export class StripeIntegration extends BaseIntegration {
  readonly definition: IntegrationDefinition = {
    config: {
      id: "stripe",
      name: "Stripe",
      description: "Process payments, manage subscriptions, and handle billing",
      icon: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/stripe.svg",
      category: "other",
      authType: "api_key",
      website: "https://stripe.com",
      docsUrl: "https://stripe.com/docs/api",
      apiKey: {
        headerName: "Authorization",
        prefix: "Bearer",
        instructions: "Get your API key from Stripe Dashboard > Developers > API keys",
      },
    },
    actions: [
      {
        id: "create_customer",
        name: "Create Customer",
        description: "Create a new Stripe customer",
        inputSchema: {
          email: {
            type: "string",
            description: "Customer email",
            required: true,
          },
          name: {
            type: "string",
            description: "Customer name",
          },
          description: {
            type: "string",
            description: "Description",
          },
          metadata: {
            type: "object",
            description: "Custom metadata",
          },
        },
        outputSchema: {
          id: { type: "string" },
          email: { type: "string" },
          name: { type: "string" },
        },
      },
      {
        id: "create_payment_intent",
        name: "Create Payment Intent",
        description: "Create a payment intent for charging a customer",
        inputSchema: {
          amount: {
            type: "number",
            description: "Amount in cents",
            required: true,
          },
          currency: {
            type: "string",
            description: "Currency code (e.g., usd)",
            required: true,
          },
          customer: {
            type: "string",
            description: "Customer ID",
          },
          description: {
            type: "string",
            description: "Payment description",
          },
          metadata: {
            type: "object",
            description: "Custom metadata",
          },
        },
        outputSchema: {
          id: { type: "string" },
          client_secret: { type: "string" },
          status: { type: "string" },
        },
      },
      {
        id: "create_subscription",
        name: "Create Subscription",
        description: "Create a recurring subscription",
        inputSchema: {
          customer: {
            type: "string",
            description: "Customer ID",
            required: true,
          },
          price: {
            type: "string",
            description: "Price ID",
            required: true,
          },
          trial_period_days: {
            type: "number",
            description: "Trial period in days",
          },
          metadata: {
            type: "object",
            description: "Custom metadata",
          },
        },
        outputSchema: {
          id: { type: "string" },
          status: { type: "string" },
          current_period_end: { type: "number" },
        },
      },
      {
        id: "list_invoices",
        name: "List Invoices",
        description: "List invoices for a customer",
        inputSchema: {
          customer: {
            type: "string",
            description: "Customer ID",
          },
          status: {
            type: "string",
            description: "Invoice status (draft, open, paid, uncollectible, void)",
          },
          limit: {
            type: "number",
            description: "Maximum results (max 100)",
            default: 10,
          },
        },
        outputSchema: {
          invoices: { type: "array" },
          has_more: { type: "boolean" },
        },
      },
      {
        id: "create_refund",
        name: "Create Refund",
        description: "Refund a payment",
        inputSchema: {
          payment_intent: {
            type: "string",
            description: "Payment Intent ID to refund",
            required: true,
          },
          amount: {
            type: "number",
            description: "Amount to refund in cents (full refund if not specified)",
          },
          reason: {
            type: "string",
            description: "Reason for refund (duplicate, fraudulent, requested_by_customer)",
          },
        },
        outputSchema: {
          id: { type: "string" },
          amount: { type: "number" },
          status: { type: "string" },
        },
      },
      {
        id: "get_balance",
        name: "Get Balance",
        description: "Get current Stripe balance",
        inputSchema: {},
        outputSchema: {
          available: { type: "array" },
          pending: { type: "array" },
        },
      },
    ],
  };

  private baseUrl = "https://api.stripe.com/v1";

  async executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult> {
    const { connection, input } = context;
    const credentials = connection.credentials;

    switch (actionId) {
      case "create_customer":
        return this.createCustomer(credentials, input);
      case "create_payment_intent":
        return this.createPaymentIntent(credentials, input);
      case "create_subscription":
        return this.createSubscription(credentials, input);
      case "list_invoices":
        return this.listInvoices(credentials, input);
      case "create_refund":
        return this.createRefund(credentials, input);
      case "get_balance":
        return this.getBalance(credentials);
      default:
        return createActionResult(false, `Unknown action: ${actionId}`);
    }
  }

  async validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }> {
    try {
      const response = await fetch(`${this.baseUrl}/balance`, {
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
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  private objectToFormData(obj: Record<string, unknown>, prefix = ""): URLSearchParams {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      const paramKey = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === "object" && !Array.isArray(value)) {
        const nested = this.objectToFormData(value as Record<string, unknown>, paramKey);
        nested.forEach((v, k) => params.set(k, v));
      } else {
        params.set(paramKey, String(value));
      }
    }

    return params;
  }

  private async createCustomer(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body = this.objectToFormData({
        email: input.email,
        name: input.name,
        description: input.description,
        metadata: input.metadata,
      });

      const response = await fetch(`${this.baseUrl}/customers`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          email: data.email,
          name: data.name,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to create customer");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createPaymentIntent(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body = this.objectToFormData({
        amount: input.amount,
        currency: input.currency,
        customer: input.customer,
        description: input.description,
        metadata: input.metadata,
      });

      const response = await fetch(`${this.baseUrl}/payment_intents`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          client_secret: data.client_secret,
          status: data.status,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to create payment intent");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createSubscription(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body = this.objectToFormData({
        customer: input.customer,
        "items[0][price]": input.price,
        trial_period_days: input.trial_period_days,
        metadata: input.metadata,
      });

      const response = await fetch(`${this.baseUrl}/subscriptions`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          status: data.status,
          current_period_end: data.current_period_end,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to create subscription");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async listInvoices(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const params = new URLSearchParams();
      if (input.customer) params.set("customer", input.customer as string);
      if (input.status) params.set("status", input.status as string);
      params.set("limit", String(input.limit || 10));

      const response = await fetch(`${this.baseUrl}/invoices?${params}`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          invoices: data.data.map((inv: Record<string, unknown>) => ({
            id: inv.id,
            customer: inv.customer,
            amount_due: inv.amount_due,
            amount_paid: inv.amount_paid,
            status: inv.status,
            created: inv.created,
          })),
          has_more: data.has_more,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to list invoices");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async createRefund(
    credentials: ConnectionCredentials,
    input: Record<string, unknown>
  ): Promise<ActionResult> {
    try {
      const body = this.objectToFormData({
        payment_intent: input.payment_intent,
        amount: input.amount,
        reason: input.reason,
      });

      const response = await fetch(`${this.baseUrl}/refunds`, {
        method: "POST",
        headers: this.getHeaders(credentials),
        body: body.toString(),
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          id: data.id,
          amount: data.amount,
          status: data.status,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to create refund");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }

  private async getBalance(credentials: ConnectionCredentials): Promise<ActionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/balance`, {
        headers: { Authorization: `Bearer ${credentials.apiKey}` },
      });

      const data = await response.json();

      if (response.ok) {
        return createActionResult(true, {
          available: data.available,
          pending: data.pending,
        });
      }

      return createActionResult(false, data.error?.message || "Failed to get balance");
    } catch (error) {
      return createActionResult(false, error instanceof Error ? error.message : "Request failed");
    }
  }
}
