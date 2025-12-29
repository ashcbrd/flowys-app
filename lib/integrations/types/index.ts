/**
 * Core types for the Flowys Integration Framework
 */

export type AuthType = "oauth2" | "api_key" | "basic_auth" | "none";

export type IntegrationCategory =
  | "communication"
  | "productivity"
  | "data"
  | "ai"
  | "storage"
  | "crm"
  | "developer"
  | "marketing"
  | "analytics"
  | "other";

export interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: IntegrationCategory;
  authType: AuthType;
  website: string;
  docsUrl?: string;

  // OAuth2 configuration
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
    scopeDelimiter?: string;
  };

  // API Key configuration
  apiKey?: {
    headerName?: string;
    prefix?: string;
    instructions?: string;
  };

  // Basic Auth configuration
  basicAuth?: {
    usernameLabel?: string;
    passwordLabel?: string;
    instructions?: string;
  };
}

export interface IntegrationAction {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, FieldSchema>;
  outputSchema: Record<string, FieldSchema>;
}

export interface IntegrationTrigger {
  id: string;
  name: string;
  description: string;
  outputSchema: Record<string, FieldSchema>;
}

export interface FieldSchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
}

export interface IntegrationDefinition {
  config: IntegrationConfig;
  actions: IntegrationAction[];
  triggers?: IntegrationTrigger[];
}

export interface ConnectionCredentials {
  // OAuth2
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType?: string;
  scope?: string;

  // API Key
  apiKey?: string;

  // Basic Auth
  username?: string;
  password?: string;

  // Custom fields
  [key: string]: unknown;
}

export interface ConnectionData {
  id: string;
  integrationId: string;
  name: string;
  credentials: ConnectionCredentials;
  metadata?: Record<string, unknown>;
  enabled: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionContext {
  connection: ConnectionData;
  input: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface OAuthState {
  integrationId: string;
  connectionName: string;
  redirectUrl: string;
  timestamp: number;
}
