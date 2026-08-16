export type NodeType = "input" | "api" | "ai" | "logic" | "output" | "webhook" | "integration" | "retrieval" | "image" | "brand" | "email";

export interface NodeContext {
  nodeId: string;
  inputs: Record<string, unknown>;
  config: Record<string, unknown>;
  globalContext: Record<string, unknown>;
  /**
   * Who this run acts as: the workflow owner, on every trigger path. Scheduled
   * and webhook-triggered runs have no session, so this cannot come from auth;
   * the caller that loaded the workflow supplies it. Steps that touch
   * user-scoped data (retrieval) fail closed when it is absent.
   */
  userId?: string;
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

export interface InputField {
  name: string;
  type: "string" | "number" | "boolean" | "json" | "file";
  required?: boolean;
  default?: unknown;
  /** Shown to whoever runs the workflow. Falls back to a humanized `name`. */
  label?: string;
  /** Optional one-line hint under the field. */
  description?: string;
  /** Example text inside the empty field. */
  placeholder?: string;
  /**
   * Expects more than a line, an email, a transcript, a pile of notes.
   * Renders a box that grows instead of a single-line field you can't read back.
   */
  multiline?: boolean;
}

export interface InputNodeConfig {
  fields: InputField[];
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

export interface RetrievalNodeConfig {
  /** {{variable}} template resolved against inputs and global context. */
  queryTemplate: string;
  /** How many passages to hand to the next step. */
  topK?: number;
  /** Restrict to one knowledge base; defaults to everything the owner can see. */
  knowledgeBaseId?: string;
  /**
   * Spend an extra model call reordering passages by how directly they answer.
   * Off by default: a step running thousands of times a month should opt in.
   */
  rerank?: boolean;
}

export interface ImageNodeConfig {
  /** {{variable}} template resolved against inputs and global context. */
  promptTemplate: string;
  /** Stored values are frozen; the provider maps them to pixels per model. */
  size?: "square" | "wide" | "tall";
  quality?: "draft" | "standard" | "best";
  /** "transparent" is what makes a logo compositable. */
  background?: "auto" | "transparent";
}

export interface BrandNodeConfig {
  /** Which image to build the kit from; defaults to the upstream {{assetId}}. */
  sourceTemplate?: string;
  /** What kind of business this is, deciding which mockup scenes are used. */
  kindTemplate?: string;
  /** The board's title. */
  businessNameTemplate?: string;
  /** One line under the title, italic. */
  taglineTemplate?: string;
}

export interface EmailNodeConfig {
  layout?: "newsletter" | "promo" | "announcement";
  /** A hex colour, or a {{token}} that resolves to one. */
  brandColorTemplate?: string;
  logoUrlTemplate?: string;
  subjectTemplate: string;
  preheaderTemplate?: string;
  headingTemplate: string;
  bodyTemplate: string;
  ctaTextTemplate?: string;
  ctaUrlTemplate?: string;
  footerTemplate?: string;
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
