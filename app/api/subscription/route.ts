import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import {
  getOrCreateSubscription,
  getCreditUsageSummary,
  getUserPlanLimits,
  PLAN_LIMITS,
  CREDIT_TIERS,
} from "@/lib/subscription";

/**
 * GET /api/subscription
 * Get the current user's subscription details and usage
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await getOrCreateSubscription(user.id);
    const usage = await getCreditUsageSummary(user.id);
    const { limits } = await getUserPlanLimits(user.id);

    return NextResponse.json({
      subscription: {
        id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        creditTierIndex: subscription.creditTierIndex,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
      },
      usage: {
        monthlyCredits: usage.monthlyCredits,
        creditsUsed: usage.creditsUsed,
        creditsRemaining: usage.creditsRemaining,
        usagePercentage: usage.usagePercentage,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        daysRemaining: usage.daysRemaining,
      },
      limits: {
        maxWorkflows: limits.maxWorkflows,
        maxNodesPerWorkflow: limits.maxNodesPerWorkflow,
        allowedNodeTypes: limits.allowedNodeTypes,
        features: limits.features,
      },
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/subscription/plans
 * Get available plans and pricing tiers
 */
export async function OPTIONS() {
  return NextResponse.json({
    plans: {
      free: {
        name: "Free",
        description: "Perfect for getting started",
        limits: PLAN_LIMITS.free,
        price: 0,
      },
      builder: {
        name: "Builder",
        description: "For serious builders who want the full toolkit",
        limits: PLAN_LIMITS.builder,
        tiers: CREDIT_TIERS.map((tier) => ({
          credits: tier.credits,
          price: tier.builderPrice,
        })),
      },
      team: {
        name: "Team",
        description: "For teams that need no limits and priority support",
        limits: PLAN_LIMITS.team,
        tiers: CREDIT_TIERS.map((tier) => ({
          credits: tier.credits,
          price: tier.teamPrice,
        })),
      },
    },
    creditCosts: {
      input: 0,
      output: 0,
      logic: 1,
      api: 1,
      ai: 10,
      webhook: 1,
      integration: 1,
    },
  });
}
