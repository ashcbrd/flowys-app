import { connectToDatabase, Workflow, Subscription } from "@/lib/db";
import { PLAN_LIMITS, type PlanType } from "@/lib/db/models/Subscription";

/**
 * Premium node types that require a paid plan OR a purchased workflow
 */
export const PREMIUM_NODE_TYPES = ["ai", "webhook", "integration"] as const;

/**
 * Result of node access check
 */
export interface NodeAccessResult {
  allowed: boolean;
  reason?: "free_tier" | "node_not_allowed" | "workflow_not_found";
  blockedNodes?: string[]; // Node types that are blocked
  message?: string;
}

/**
 * Check if a user can access a specific node type for a workflow
 *
 * Access is granted if ANY of these conditions are met:
 * 1. The node type is included in the free plan
 * 2. The user has an active paid subscription
 * 3. The workflow was purchased from the marketplace (isPurchased === true)
 */
export async function canAccessNodeType(
  userId: string,
  workflowId: string,
  nodeType: string
): Promise<boolean> {
  await connectToDatabase();

  // Free tier nodes are always accessible
  if (PLAN_LIMITS.free.allowedNodeTypes.includes(nodeType)) {
    return true;
  }

  // Check user's subscription
  const subscription = await Subscription.findOne({ userId });
  const plan: PlanType = subscription?.plan || "free";

  // Paid plans have access to all nodes
  if (plan !== "free" && subscription?.status === "active") {
    return true;
  }

  // Check if workflow is purchased (unlocks all premium nodes)
  const workflow = await Workflow.findById(workflowId);
  if (workflow?.isPurchased === true) {
    return true;
  }

  // Free user trying to use premium node in non-purchased workflow
  return false;
}

/**
 * Check if a user can execute a workflow
 * Returns detailed information about which nodes are blocked (if any)
 */
export async function canExecuteWorkflow(
  userId: string,
  workflowId: string
): Promise<NodeAccessResult> {
  await connectToDatabase();

  const workflow = await Workflow.findById(workflowId);
  if (!workflow) {
    return {
      allowed: false,
      reason: "workflow_not_found",
      message: "Workflow not found",
    };
  }

  // If workflow is purchased, all nodes are allowed
  if (workflow.isPurchased === true) {
    return { allowed: true };
  }

  // Check user's subscription
  const subscription = await Subscription.findOne({ userId });
  const plan: PlanType = subscription?.plan || "free";

  // Paid plans have access to all nodes
  if (plan !== "free" && subscription?.status === "active") {
    return { allowed: true };
  }

  // Free user - check if workflow contains premium nodes
  const allowedNodeTypes = PLAN_LIMITS.free.allowedNodeTypes;
  const blockedNodes: string[] = [];

  for (const node of workflow.nodes) {
    if (!allowedNodeTypes.includes(node.type)) {
      if (!blockedNodes.includes(node.type)) {
        blockedNodes.push(node.type);
      }
    }
  }

  if (blockedNodes.length > 0) {
    return {
      allowed: false,
      reason: "node_not_allowed",
      blockedNodes,
      message: `Your free plan doesn't include ${blockedNodes.join(", ")} nodes. Upgrade to use them.`,
    };
  }

  return { allowed: true };
}

/**
 * Get the list of premium nodes in a workflow that require a paid plan
 */
export function getPremiumNodesInWorkflow(nodes: Array<{ type: string }>): string[] {
  const freeNodeTypes = PLAN_LIMITS.free.allowedNodeTypes;
  const premiumNodes: string[] = [];

  for (const node of nodes) {
    if (!freeNodeTypes.includes(node.type)) {
      if (!premiumNodes.includes(node.type)) {
        premiumNodes.push(node.type);
      }
    }
  }

  return premiumNodes;
}

/**
 * Format blocked nodes for display
 */
export function formatBlockedNodesMessage(blockedNodes: string[]): string {
  const nodeLabels: Record<string, string> = {
    ai: "AI",
    webhook: "Webhook",
    integration: "Integration",
  };

  const formatted = blockedNodes.map((n) => nodeLabels[n] || n);

  if (formatted.length === 1) {
    return `${formatted[0]} nodes require a paid plan`;
  }

  const last = formatted.pop();
  return `${formatted.join(", ")} and ${last} nodes require a paid plan`;
}
