import type {
  IntegrationDefinition,
  IntegrationAction,
  ActionContext,
  ActionResult,
  ConnectionCredentials,
} from "./types";

/**
 * Base class for all integrations
 * Each integration provider extends this class
 */
export abstract class BaseIntegration {
  abstract readonly definition: IntegrationDefinition;

  /**
   * Execute an action with the given context
   */
  abstract executeAction(
    actionId: string,
    context: ActionContext
  ): Promise<ActionResult>;

  /**
   * Validate credentials before saving
   */
  abstract validateCredentials(
    credentials: ConnectionCredentials
  ): Promise<{ valid: boolean; error?: string; metadata?: Record<string, unknown> }>;

  /**
   * Refresh OAuth2 tokens if needed
   */
  async refreshTokens?(
    credentials: ConnectionCredentials
  ): Promise<ConnectionCredentials | null>;

  /**
   * Get action by ID
   */
  getAction(actionId: string): IntegrationAction | undefined {
    return this.definition.actions.find((a) => a.id === actionId);
  }

  /**
   * Check if credentials need refresh (for OAuth2)
   */
  needsRefresh(credentials: ConnectionCredentials): boolean {
    if (!credentials.expiresAt) return false;
    const expiresAt = new Date(credentials.expiresAt);
    const now = new Date();
    // Refresh if expires in less than 5 minutes
    return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  }

  /**
   * Make an authenticated HTTP request
   */
  protected async makeRequest(
    url: string,
    options: RequestInit,
    credentials: ConnectionCredentials
  ): Promise<Response> {
    const headers = new Headers(options.headers);

    // Add authentication based on auth type
    if (credentials.accessToken) {
      headers.set(
        "Authorization",
        `${credentials.tokenType || "Bearer"} ${credentials.accessToken}`
      );
    } else if (credentials.apiKey) {
      const config = this.definition.config.apiKey;
      const headerName = config?.headerName || "Authorization";
      const prefix = config?.prefix || "Bearer";
      headers.set(headerName, `${prefix} ${credentials.apiKey}`);
    } else if (credentials.username && credentials.password) {
      const encoded = Buffer.from(
        `${credentials.username}:${credentials.password}`
      ).toString("base64");
      headers.set("Authorization", `Basic ${encoded}`);
    }

    return fetch(url, { ...options, headers });
  }
}

/**
 * Helper to create standardized action results
 */
export function createActionResult(
  success: boolean,
  outputOrError: Record<string, unknown> | string
): ActionResult {
  if (success) {
    return { success: true, output: outputOrError as Record<string, unknown> };
  }
  return { success: false, error: outputOrError as string };
}
