export type NodeType = "input" | "api" | "ai" | "logic" | "output" | "webhook" | "integration";

export interface NodeContext {
  nodeId: string;
  inputs: Record<string, unknown>;
  config: Record<string, unknown>;
  globalContext: Record<string, unknown>;
}

export interface NodeResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export interface NodeHandler {
  type: NodeType;
  execute(context: NodeContext): Promise<NodeResult>;
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] };
}

export interface InputNodeConfig {
  fields: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "json";
    required?: boolean;
    default?: unknown;
  }>;
}

export interface ApiNodeConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  responseMapping?: Record<string, string>;
}

export interface AiNodeConfig {
  provider: "openai" | "anthropic";
  model: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  temperature?: number;
  maxTokens?: number;
  outputSchema?: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface LogicNodeConfig {
  operation: "filter" | "map" | "reduce" | "condition" | "transform" | "passthrough" | "sort" | "slice";
  condition?: string;
  expression?: string;
  mappings?: Record<string, string>;
}

export interface OutputNodeConfig {
  format: "json" | "text" | "markdown";
  template?: string;
  fields?: string[];
}

export interface WebhookNodeConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  headerMappings?: Record<string, string>;
  payloadTemplate?: Record<string, unknown>;
  secret?: string;
  timeout?: number;
  continueOnError?: boolean;
}

export interface IntegrationNodeConfig {
  connectionId: string;
  connectionName?: string;
  integrationId: string;
  integrationName?: string;
  actionId: string;
  actionName?: string;
  input: Record<string, unknown>;
}
