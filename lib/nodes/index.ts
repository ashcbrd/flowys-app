import { InputNodeHandler } from "./input";
import { ApiNodeHandler } from "./api";
import { AiNodeHandler } from "./ai";
import { LogicNodeHandler } from "./logic";
import { OutputNodeHandler } from "./output";
import { WebhookNodeHandler } from "./webhook";
import { IntegrationNodeHandler } from "./integration";
import type { NodeHandler, NodeType, NodeContext, NodeResult } from "./types";

export type {
  NodeHandler,
  NodeType,
  NodeContext,
  NodeResult,
  InputNodeConfig,
  ApiNodeConfig,
  AiNodeConfig,
  LogicNodeConfig,
  OutputNodeConfig,
  WebhookNodeConfig,
  IntegrationNodeConfig,
} from "./types";

const handlers: Record<NodeType, NodeHandler> = {
  input: new InputNodeHandler(),
  api: new ApiNodeHandler(),
  ai: new AiNodeHandler(),
  logic: new LogicNodeHandler(),
  output: new OutputNodeHandler(),
  webhook: new WebhookNodeHandler(),
  integration: new IntegrationNodeHandler(),
};

export function getNodeHandler(type: NodeType): NodeHandler {
  const handler = handlers[type];
  if (!handler) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return handler;
}

export async function executeNode(
  type: NodeType,
  context: NodeContext
): Promise<NodeResult> {
  const handler = getNodeHandler(type);
  return handler.execute(context);
}

export function validateNodeConfig(
  type: NodeType,
  config: Record<string, unknown>
): { valid: boolean; errors?: string[] } {
  const handler = getNodeHandler(type);
  return handler.validateConfig(config);
}
