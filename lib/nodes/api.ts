import type { NodeHandler, NodeContext, NodeResult, ApiNodeConfig } from "./types";
import { interpolateVariables, getNestedValue } from "@/lib/utils/template";
import { isPrivateOrReservedHost } from "@/lib/security/url-guard";

export class ApiNodeHandler implements NodeHandler {
  type = "api" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as ApiNodeConfig;

    try {
      // Validate URL
      const url = interpolateVariables(config.url, context.inputs, "empty");
      if (!url || url === "https://api.example.com/data") {
        return {
          success: false,
          error: "Please configure a valid API URL. Click on this node and update the 'url' field with your API endpoint.",
        };
      }

      // Validate URL format and check for SSRF
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return {
          success: false,
          error: `Invalid URL format: "${url}". Make sure the URL starts with http:// or https://`,
        };
      }

      // SSRF Protection: Block requests to private/internal addresses
      if (isPrivateOrReservedHost(parsedUrl.hostname)) {
        return {
          success: false,
          error: "Requests to private or internal addresses are not allowed for security reasons.",
        };
      }

      // Only allow http and https protocols
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return {
          success: false,
          error: `Protocol "${parsedUrl.protocol}" is not allowed. Only http:// and https:// are supported.`,
        };
      }

      const headers: Record<string, string> = {};

      if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
          headers[key] = interpolateVariables(String(value), context.inputs, "empty");
        }
      }

      const fetchOptions: RequestInit = {
        method: config.method || "GET",
        headers,
      };

      if (config.body && ["POST", "PUT", "PATCH"].includes(config.method)) {
        const body = interpolateVariables(config.body, context.inputs, "empty");
        fetchOptions.body = body;
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }

      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      fetchOptions.signal = controller.signal;

      let response: Response;
      try {
        response = await fetch(url, fetchOptions);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return {
            success: false,
            error: "The API request timed out after 30 seconds. The server may be slow or unreachable.",
          };
        }
        throw fetchError;
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
          if (errorBody.length > 200) errorBody = errorBody.substring(0, 200) + "...";
        } catch {}

        return {
          success: false,
          error: `API returned error ${response.status} (${response.statusText})${errorBody ? `: ${errorBody}` : ""}. Check the API URL and any required authentication.`,
        };
      }

      const contentType = response.headers.get("content-type");
      let data: unknown;

      if (contentType?.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          return {
            success: false,
            error: "The API returned invalid JSON. Check that the API endpoint returns valid JSON data.",
          };
        }
      } else {
        data = await response.text();
      }

      let output: Record<string, unknown>;

      if (config.responseMapping && typeof data === "object" && data !== null) {
        output = {};
        for (const [outputKey, sourcePath] of Object.entries(config.responseMapping)) {
          output[outputKey] = getNestedValue(data as Record<string, unknown>, sourcePath);
        }
      } else if (Array.isArray(data)) {
        // If data is an array, output it as 'data' for downstream nodes
        output = { data, count: data.length };
      } else if (typeof data === "object" && data !== null) {
        // Spread object properties for easy access
        output = { ...data as Record<string, unknown> };
      } else {
        output = { response: data };
      }

      return {
        success: true,
        output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Provide helpful error messages
      if (message.includes("fetch") || message.includes("network") || message.includes("ECONNREFUSED")) {
        return {
          success: false,
          error: "Could not connect to the API. Check your internet connection and verify the API URL is correct.",
        };
      }

      return {
        success: false,
        error: `API request failed: ${message}`,
      };
    }
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // URL can be empty during save (will be validated at execution time)
    if (config.url !== undefined && typeof config.url !== "string") {
      errors.push("url must be a string");
    }

    // Method validation - allow default or valid methods
    if (config.method !== undefined && !["GET", "POST", "PUT", "DELETE", "PATCH"].includes(config.method as string)) {
      errors.push("method must be GET, POST, PUT, DELETE, or PATCH");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
