import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getOrCreateSubscription, getCreditUsageSummary, getUserPlanLimits } from "@/lib/subscription";
import { cancelSubscription, changeSubscriptionPlan, getAvailableProducts } from "@/lib/payments";
import { CREDIT_TIERS, PLAN_LIMITS, type PlanType } from "@/lib/db/models/Subscription";

/**
 * GET /api/billing
 *
 * Get current billing information including subscription, usage, and available plans
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
        monthlyCredits: subscription.monthlyCredits,
        dodoCustomerId: subscription.dodoCustomerId,
        dodoSubscriptionId: subscription.dodoSubscriptionId,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt,
      },
      usage: {
        creditsUsed: usage.creditsUsed,
        creditsRemaining: usage.creditsRemaining,
        usagePercentage: usage.usagePercentage,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        daysRemaining: usage.daysRemaining,
      },
      limits,
      availablePlans: {
        free: {
          name: "Free",
          price: 0,
          credits: PLAN_LIMITS.free.monthlyCredits,
          limits: PLAN_LIMITS.free,
        },
        builder: {
          name: "Builder",
          tiers: CREDIT_TIERS.map((tier, index) => ({
            index,
            credits: tier.credits,
            price: tier.builderPrice,
          })),
          limits: PLAN_LIMITS.builder,
        },
        team: {
          name: "Team",
          tiers: CREDIT_TIERS.map((tier, index) => ({
            index,
            credits: tier.credits,
            price: tier.teamPrice,
          })),
          limits: PLAN_LIMITS.team,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching billing info:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing information" },
      { status: 500 }
    );
  }
}

const UpdateSubscriptionSchema = z.object({
  action: z.enum(["change_plan", "cancel"]),
  plan: z.enum(["free", "builder", "team"]).optional(),
  tierIndex: z.number().int().min(0).max(CREDIT_TIERS.length - 1).optional(),
  proration: z.enum(["prorated_immediately", "full_immediately", "difference_immediately"]).optional(),
});

/**
 * PATCH /api/billing
 *
 * Update subscription (change plan or cancel)
 *
 * Request body for plan change:
 * {
 *   action: "change_plan",
 *   plan: "free" | "builder" | "team",
 *   tierIndex: 0-6 (required for builder/team),
 *   proration: "prorated_immediately" | "full_immediately" | "difference_immediately"
 * }
 *
 * Request body for cancellation:
 * {
 *   action: "cancel"
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = UpdateSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const subscription = await getOrCreateSubscription(user.id);
    const { action, plan, tierIndex, proration } = parsed.data;

    if (action === "cancel") {
      if (!subscription.dodoSubscriptionId) {
        return NextResponse.json(
          { error: "No active subscription to cancel" },
          { status: 400 }
        );
      }

      await cancelSubscription(subscription.dodoSubscriptionId);

      return NextResponse.json({
        message: "Subscription cancelled successfully",
        subscription: {
          ...subscription,
          cancelAtPeriodEnd: true,
        },
      });
    }

    if (action === "change_plan") {
      if (!plan) {
        return NextResponse.json(
          { error: "Plan is required for change_plan action" },
          { status: 400 }
        );
      }

      if (plan === "free") {
        // Downgrade to free - cancel current subscription
        if (subscription.dodoSubscriptionId) {
          await cancelSubscription(subscription.dodoSubscriptionId);
        }

        return NextResponse.json({
          message: "Downgraded to free plan",
          note: "Your current plan will remain active until the end of the billing period.",
        });
      }

      if (tierIndex === undefined) {
        return NextResponse.json(
          { error: "tierIndex is required for paid plans" },
          { status: 400 }
        );
      }

      if (!subscription.dodoSubscriptionId) {
        // No existing subscription - redirect to checkout
        return NextResponse.json(
          {
            error: "No active subscription",
            redirect: "/api/billing/checkout",
            message: "Please create a new subscription through checkout",
          },
          { status: 400 }
        );
      }

      await changeSubscriptionPlan({
        subscriptionId: subscription.dodoSubscriptionId,
        newPlan: plan as PlanType,
        newTierIndex: tierIndex,
        proration: proration || "prorated_immediately",
      });

      return NextResponse.json({
        message: "Plan changed successfully",
        newPlan: plan,
        newTierIndex: tierIndex,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error updating subscription:", error);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}
