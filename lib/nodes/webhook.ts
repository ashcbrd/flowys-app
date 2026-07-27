import type { NodeHandler, NodeContext, NodeResult, WebhookNodeConfig } from "./types";
import { generateWebhookSignature } from "@/lib/middleware/apiAuth";
import { interpolateVariables, interpolateDeep, getNestedValue } from "@/lib/utils/template";

export class WebhookNodeHandler implements NodeHandler {
  type = "webhook" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as WebhookNodeConfig;

    try {
      // Validate URL
      if (!config.url) {
        return {
          success: false,
          error: "Webhook URL is required",
        };
      }

      let url: URL;
      try {
        url = new URL(config.url);
      } catch {
        return {
          success: false,
          error: `Invalid webhook URL: ${config.url}`,
        };
      }

      // Build payload from inputs and template
      let payload: Record<string, unknown>;

      if (config.payloadTemplate) {
        // Substitute into the parsed structure, not into JSON text. Interpolating
        // a stringified template and re-parsing it breaks the moment a value
        // contains a newline or a quote, which any multi-line result does, and
        // failed with a message about the template rather than the real cause.
        payload = interpolateDeep(config.payloadTemplate, {
          ...context.inputs,
          ...context.globalContext,
        }) as Record<string, unknown>;
      } else {
        // Default: send all inputs as payload
        payload = {
          ...context.inputs,
          _meta: {
            workflowId: context.globalContext?.workflowId,
            executionId: context.globalContext?.executionId,
            nodeId: context.nodeId,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Flowys-Workflow/1.0",
        ...(config.headers || {}),
      };

      // Add custom headers from inputs if specified
      if (config.headerMappings) {
        for (const [headerName, inputPath] of Object.entries(config.headerMappings)) {
          const value = getNestedValue(context.inputs, inputPath);
          if (value !== undefined) {
            headers[headerName] = String(value);
          }
        }
      }

      // Generate signature if secret is provided
      const payloadString = JSON.stringify(payload);
      if (config.secret) {
        headers["X-Webhook-Signature"] = generateWebhookSignature(
          payloadString,
          config.secret
        );
      }

      // Setup timeout
      const controller = new AbortController();
      const timeout = config.timeout || 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const startTime = Date.now();

      try {
        const response = await fetch(url.toString(), {
          method: config.method || "POST",
          headers,
          body: config.method !== "GET" ? payloadString : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        // Parse response
        let responseData: unknown;
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          try {
            responseData = await response.json();
          } catch {
            responseData = await response.text();
          }
        } else {
          responseData = await response.text();
        }

        if (!response.ok) {
          // Return error but include response data for debugging
          if (config.continueOnError) {
            return {
              success: true,
              output: {
                success: false,
                statusCode: response.status,
                statusText: response.statusText,
                response: responseData,
                duration,
                url: url.toString(),
              },
            };
          }

          return {
            success: false,
            error: `Webhook failed with status ${response.status}: ${response.statusText}`,
            output: {
              statusCode: response.status,
              response: responseData,
            },
          };
        }

        return {
          success: true,
          output: {
            success: true,
            statusCode: response.status,
            response: responseData,
            duration,
            url: url.toString(),
          },
        };
      } catch (error) {
        clearTimeout(timeoutId);

        const timedOut = error instanceof Error && error.name === "AbortError";
        const reason = timedOut
          ? `Webhook request timed out after ${timeout}ms`
          : `Could not reach ${url.toString()}`;

        // `continueOnError` used to apply only to HTTP error responses, so a
        // receiver that was slow or unreachable still failed the whole run,
        // throwing away results the earlier steps had already produced. Those are
        // the cases it most needs to cover.
        if (config.continueOnError) {
          return {
            success: true,
            output: { success: false, error: reason, url: url.toString() },
          };
        }

        return { success: false, error: reason };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (config.continueOnError) {
        return {
          success: true,
          output: { success: false, error: `Webhook error: ${message}` },
        };
      }

      return { success: false, error: `Webhook error: ${message}` };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // URL can be empty during save (will be validated at execution time)
    // Only validate URL format if a non-empty URL is provided
    if (config.url !== undefined && typeof config.url !== "string") {
      errors.push("url must be a string");
    } else if (config.url && typeof config.url === "string" && config.url.trim() !== "") {
      try {
        new URL(config.url as string);
      } catch {
        errors.push("url must be a valid URL");
      }
    }

    if (config.method !== undefined) {
      const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
      if (!validMethods.includes(config.method as string)) {
        errors.push(`method must be one of: ${validMethods.join(", ")}`);
      }
    }

    if (config.timeout !== undefined) {
      const timeout = config.timeout as number;
      if (typeof timeout !== "number" || timeout < 1000 || timeout > 120000) {
        errors.push("timeout must be a number between 1000 and 120000 milliseconds");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
