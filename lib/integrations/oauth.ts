import crypto from "crypto";
import type { IntegrationConfig, OAuthState, ConnectionCredentials } from "./types";

// In-memory state storage (use Redis in production)
const oauthStates = new Map<string, OAuthState>();

// State expires after 10 minutes
const STATE_EXPIRY_MS = 10 * 60 * 1000;

/**
 * OAuth2 Flow Handler
 * Manages the OAuth2 authorization flow for integrations
 */
export class OAuth2Handler {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(integrationId: string) {
    // Load credentials from environment based on integration
    this.clientId = process.env[`${integrationId.toUpperCase().replace(/-/g, "_")}_CLIENT_ID`] || "";
    this.clientSecret = process.env[`${integrationId.toUpperCase().replace(/-/g, "_")}_CLIENT_SECRET`] || "";
    this.redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/integrations/callback`;
  }

  /**
   * Generate the authorization URL
   */
  getAuthorizationUrl(
    config: IntegrationConfig,
    connectionName: string,
    redirectUrl: string
  ): { url: string; state: string } {
    if (!config.oauth2) {
      throw new Error("Integration does not support OAuth2");
    }

    const state = crypto.randomBytes(32).toString("hex");

    // Store state for verification
    oauthStates.set(state, {
      integrationId: config.id,
      connectionName,
      redirectUrl,
      timestamp: Date.now(),
    });

    // Clean up expired states
    this.cleanupExpiredStates();

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      state,
      scope: config.oauth2.scopes.join(config.oauth2.scopeDelimiter || " "),
    });

    // Add integration-specific parameters
    if (config.id === "notion") {
      params.set("owner", "user");
    }

    return {
      url: `${config.oauth2.authorizationUrl}?${params.toString()}`,
      state,
    };
  }

  /**
   * Verify OAuth state
   */
  verifyState(state: string): OAuthState | null {
    const stored = oauthStates.get(state);
    if (!stored) return null;

    // Check if expired
    if (Date.now() - stored.timestamp > STATE_EXPIRY_MS) {
      oauthStates.delete(state);
      return null;
    }

    // Delete after use (one-time use)
    oauthStates.delete(state);
    return stored;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    config: IntegrationConfig,
    code: string
  ): Promise<ConnectionCredentials> {
    if (!config.oauth2) {
      throw new Error("Integration does not support OAuth2");
    }

    const body: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    };

    const headers: HeadersInit = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    // Notion uses Basic Auth for token exchange
    if (config.id === "notion") {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${auth}`;
      delete body.client_id;
      delete body.client_secret;
    }

    // GitHub requires Accept header
    if (config.id === "github") {
      headers.Accept = "application/json";
    }

    const response = await fetch(config.oauth2.tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type || "Bearer",
      scope: data.scope,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    config: IntegrationConfig,
    refreshToken: string
  ): Promise<ConnectionCredentials> {
    if (!config.oauth2) {
      throw new Error("Integration does not support OAuth2");
    }

    const response = await fetch(config.oauth2.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      tokenType: data.token_type || "Bearer",
      scope: data.scope,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    };
  }

  /**
   * Check if token needs refresh
   */
  needsRefresh(credentials: ConnectionCredentials, bufferMs = 5 * 60 * 1000): boolean {
    if (!credentials.expiresAt) return false;
    const expiresAt = new Date(credentials.expiresAt).getTime();
    return Date.now() + bufferMs >= expiresAt;
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [state, data] of oauthStates.entries()) {
      if (now - data.timestamp > STATE_EXPIRY_MS) {
        oauthStates.delete(state);
      }
    }
  }
}

/**
 * Create an OAuth2 handler for an integration
 */
export function createOAuth2Handler(integrationId: string): OAuth2Handler {
  return new OAuth2Handler(integrationId);
}
