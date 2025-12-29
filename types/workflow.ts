export type NodeType = "input" | "api" | "ai" | "logic" | "output";

export interface NodeConfig {
  [key: string]: unknown;
}

export interface InputNodeConfig extends NodeConfig {
  fields: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "json";
    required?: boolean;
    default?: unknown;
  }>;
}

export interface ApiNodeConfig extends NodeConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  responseMapping?: Record<string, string>;
}

export interface AiNodeConfig extends NodeConfig {
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

export interface LogicNodeConfig extends NodeConfig {
  operation: "filter" | "map" | "reduce" | "condition" | "transform";
  condition?: string;
  expression?: string;
  mappings?: Record<string, string>;
}

export interface OutputNodeConfig extends NodeConfig {
  format: "json" | "text" | "markdown";
  template?: string;
  fields?: string[];
}
