import type { NodeHandler, NodeContext, NodeResult, ApiNodeConfig } from "./types";

/**
 * SSRF Protection: Check if a hostname resolves to a private/internal IP
 * Blocks requests to:
 * - Private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
 * - Loopback addresses (127.x, localhost)
 * - Link-local addresses (169.254.x - includes cloud metadata endpoints)
 * - IPv6 private/loopback addresses
 */
function isPrivateOrReservedHost(hostname: string): boolean {
  // Block localhost and common internal hostnames
  const blockedHostnames = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "metadata.google.internal",
    "metadata.goog",
    "169.254.169.254", // AWS/GCP/Azure metadata endpoint
  ];

  const lowerHostname = hostname.toLowerCase();
  if (blockedHostnames.includes(lowerHostname)) {
    return true;
  }

  // Block .local and .internal domains
  if (lowerHostname.endsWith(".local") || lowerHostname.endsWith(".internal")) {
    return true;
  }

  // Check if hostname is an IP address and validate ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const [, a, b, c, d] = match.map(Number);

    // Validate IP address components
    if ([a, b, c, d].some((n) => n > 255)) {
      return true; // Invalid IP
    }

    // 10.0.0.0/8 - Private
    if (a === 10) return true;

    // 172.16.0.0/12 - Private
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 - Private
    if (a === 192 && b === 168) return true;

    // 127.0.0.0/8 - Loopback
    if (a === 127) return true;

    // 169.254.0.0/16 - Link-local (includes cloud metadata)
    if (a === 169 && b === 254) return true;

    // 0.0.0.0/8 - Current network
    if (a === 0) return true;

    // 224.0.0.0/4 - Multicast
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 - Reserved
    if (a >= 240) return true;
  }

  // Check for IPv6 patterns
  if (hostname.includes(":")) {
    const lowerIp = hostname.toLowerCase();
    // Loopback
    if (lowerIp === "::1" || lowerIp.startsWith("::ffff:127.")) return true;
    // Link-local
    if (lowerIp.startsWith("fe80:")) return true;
    // Unique local (private)
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) return true;
  }

  return false;
}

export class ApiNodeHandler implements NodeHandler {
  type = "api" as const;

  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.config as unknown as ApiNodeConfig;

    try {
      // Validate URL
      const url = this.interpolateVariables(config.url, context.inputs);
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
          headers[key] = this.interpolateVariables(String(value), context.inputs);
        }
      }

      const fetchOptions: RequestInit = {
        method: config.method || "GET",
        headers,
      };

      if (config.body && ["POST", "PUT", "PATCH"].includes(config.method)) {
        const body = this.interpolateVariables(config.body, context.inputs);
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
          output[outputKey] = this.getNestedValue(data as Record<string, unknown>, sourcePath);
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

  private interpolateVariables(template: string, inputs: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const value = this.getNestedValue(inputs, path);
      return value !== undefined ? String(value) : "";
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }

    return current;
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
