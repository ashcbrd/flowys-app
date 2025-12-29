import { v4 as uuid } from "uuid";
import { connectToDatabase } from "@/lib/db";
import {
  Subscription,
  ISubscription,
  PlanType,
  PLAN_LIMITS,
  CREDIT_COSTS,
  CREDIT_TIERS,
} from "@/lib/db/models/Subscription";
import type { NodeData } from "@/lib/db/schemas";

export { PLAN_LIMITS, CREDIT_COSTS, CREDIT_TIERS };
export type { PlanType, ISubscription };

/**
 * Calculate the total credit cost for executing a workflow
 */
export function calculateWorkflowCost(nodes: NodeData[]): number {
  return nodes.reduce((total, node) => {
    const cost = CREDIT_COSTS[node.type] || 0;
    return total + cost;
  }, 0);
}

/**
 * Get or create a subscription for a user
 * New users get the Free plan by default
 */
export async function getOrCreateSubscription(userId: string): Promise<ISubscription> {
  await connectToDatabase();

  let subscription = await Subscription.findOne({ userId }).lean();

  if (!subscription) {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const newSubscription = await Subscription.create({
      _id: uuid(),
      userId,
      plan: "free",
      creditTierIndex: 0,
      monthlyCredits: PLAN_LIMITS.free.monthlyCredits,
      creditsUsed: 0,
      creditsRemaining: PLAN_LIMITS.free.monthlyCredits,
      periodStart: now,
      periodEnd,
      status: "active",
      cancelAtPeriodEnd: false,
    });

    subscription = newSubscription.toObject();
  }

  return subscription as ISubscription;
}

/**
 * Get subscription for a user (returns null if not found)
 */
export async function getSubscription(userId: string): Promise<ISubscription | null> {
  await connectToDatabase();
  const subscription = await Subscription.findOne({ userId }).lean();
  return subscription as ISubscription | null;
}

/**
 * Check if user has enough credits for a workflow execution
 */
export async function hasEnoughCredits(
  userId: string,
  nodes: NodeData[]
): Promise<{ hasCredits: boolean; required: number; remaining: number; subscription: ISubscription }> {
  const subscription = await getOrCreateSubscription(userId);
  const required = calculateWorkflowCost(nodes);

  // Check if period has expired and reset credits if needed
  const now = new Date();
  if (now > new Date(subscription.periodEnd)) {
    await resetCredits(userId);
    const updatedSubscription = await getSubscription(userId);
    return {
      hasCredits: (updatedSubscription?.creditsRemaining || 0) >= required,
      required,
      remaining: updatedSubscription?.creditsRemaining || 0,
      subscription: updatedSubscription as ISubscription,
    };
  }

  return {
    hasCredits: subscription.creditsRemaining >= required,
    required,
    remaining: subscription.creditsRemaining,
    subscription,
  };
}

/**
 * Deduct credits from user's subscription
 */
export async function deductCredits(
  userId: string,
  amount: number
): Promise<{ success: boolean; remaining: number; error?: string }> {
  await connectToDatabase();

  const subscription = await Subscription.findOne({ userId });

  if (!subscription) {
    return { success: false, remaining: 0, error: "Subscription not found" };
  }

  if (subscription.creditsRemaining < amount) {
    return {
      success: false,
      remaining: subscription.creditsRemaining,
      error: "Insufficient credits",
    };
  }

  subscription.creditsUsed += amount;
  subscription.creditsRemaining -= amount;
  await subscription.save();

  return { success: true, remaining: subscription.creditsRemaining };
}

/**
 * Reset credits at the start of a new billing period
 */
export async function resetCredits(userId: string): Promise<void> {
  await connectToDatabase();

  const subscription = await Subscription.findOne({ userId });
  if (!subscription) return;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  subscription.creditsUsed = 0;
  subscription.creditsRemaining = subscription.monthlyCredits;
  subscription.periodStart = now;
  subscription.periodEnd = periodEnd;
  await subscription.save();
}

/**
 * Check if a node type is allowed for the user's plan
 */
export function isNodeTypeAllowed(plan: PlanType, nodeType: string): boolean {
  return PLAN_LIMITS[plan].allowedNodeTypes.includes(nodeType);
}

/**
 * Options for workflow validation
 */
interface ValidateWorkflowOptions {
  workflowCount?: number;
  /**
   * If true, skip node type restrictions (for purchased workflows)
   * Purchased workflows unlock premium nodes regardless of user's plan
   */
  isPurchased?: boolean;
}

/**
 * Validate workflow against plan limits
 *
 * IMPORTANT: Purchased workflows bypass node type restrictions.
 * If a user bought a workflow from the marketplace, they can use
 * all nodes in it even if they're on a free plan.
 */
export async function validateWorkflowAgainstPlan(
  userId: string,
  nodes: NodeData[],
  options: ValidateWorkflowOptions = {}
): Promise<{ valid: boolean; errors: string[] }> {
  const { workflowCount, isPurchased = false } = options;
  const subscription = await getOrCreateSubscription(userId);
  const limits = PLAN_LIMITS[subscription.plan];
  const errors: string[] = [];

  // Check max nodes per workflow
  // SKIP this check for purchased workflows - they can have any number of nodes
  if (!isPurchased && limits.maxNodesPerWorkflow !== -1 && nodes.length > limits.maxNodesPerWorkflow) {
    errors.push(
      `Your ${subscription.plan} plan allows up to ${limits.maxNodesPerWorkflow} nodes per workflow. ` +
      `You have ${nodes.length} nodes. Upgrade to add more.`
    );
  }

  // Check if node types are allowed
  // SKIP this check for purchased workflows - they unlock premium nodes
  if (!isPurchased) {
    for (const node of nodes) {
      if (!isNodeTypeAllowed(subscription.plan, node.type)) {
        const nodeTypeName = node.type.charAt(0).toUpperCase() + node.type.slice(1);
        errors.push(
          `${nodeTypeName} nodes are not available on the ${subscription.plan} plan. Upgrade to use this feature.`
        );
      }
    }
  }

  // Check workflow count if provided
  if (workflowCount !== undefined && limits.maxWorkflows !== -1) {
    if (workflowCount >= limits.maxWorkflows) {
      errors.push(
        `Your ${subscription.plan} plan allows up to ${limits.maxWorkflows} workflows. ` +
        `Upgrade to create more workflows.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a specific feature is enabled for the plan
 */
export function isFeatureEnabled(
  plan: PlanType,
  feature: keyof typeof PLAN_LIMITS.free.features
): boolean {
  return PLAN_LIMITS[plan].features[feature];
}

/**
 * Get plan limits for a user
 */
export async function getUserPlanLimits(userId: string): Promise<{
  subscription: ISubscription;
  limits: typeof PLAN_LIMITS.free;
}> {
  const subscription = await getOrCreateSubscription(userId);
  const limits = { ...PLAN_LIMITS[subscription.plan] };

  // Override monthly credits with the user's selected tier
  if (subscription.plan !== "free") {
    limits.monthlyCredits = subscription.monthlyCredits;
  }

  return { subscription, limits };
}

/**
 * Upgrade or change subscription plan
 */
export async function updateSubscription(
  userId: string,
  plan: PlanType,
  creditTierIndex: number = 0
): Promise<ISubscription> {
  await connectToDatabase();

  const monthlyCredits =
    plan === "free"
      ? PLAN_LIMITS.free.monthlyCredits
      : CREDIT_TIERS[creditTierIndex]?.credits || CREDIT_TIERS[0].credits;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      plan,
      creditTierIndex,
      monthlyCredits,
      creditsRemaining: monthlyCredits,
      creditsUsed: 0,
      periodStart: now,
      periodEnd,
      status: "active",
    },
    { new: true, upsert: true }
  ).lean();

  return subscription as ISubscription;
}

/**
 * Get credit usage summary for a user
 */
export async function getCreditUsageSummary(userId: string): Promise<{
  plan: PlanType;
  monthlyCredits: number;
  creditsUsed: number;
  creditsRemaining: number;
  usagePercentage: number;
  periodStart: Date;
  periodEnd: Date;
  daysRemaining: number;
}> {
  const subscription = await getOrCreateSubscription(userId);

  const now = new Date();
  const periodEnd = new Date(subscription.periodEnd);
  const daysRemaining = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  const usagePercentage =
    subscription.monthlyCredits > 0
      ? Math.round((subscription.creditsUsed / subscription.monthlyCredits) * 100)
      : 0;

  return {
    plan: subscription.plan,
    monthlyCredits: subscription.monthlyCredits,
    creditsUsed: subscription.creditsUsed,
    creditsRemaining: subscription.creditsRemaining,
    usagePercentage,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
    daysRemaining,
  };
}
