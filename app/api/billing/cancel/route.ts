import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { cancelSubscription } from "@/lib/payments";
import { getOrCreateSubscription } from "@/lib/subscription";
import { connectToDatabase, Subscription } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/db/models/Subscription";

const CancelSchema = z.object({
  immediately: z.boolean().default(true),
});

/**
 * POST /api/billing/cancel
 *
 * Cancel the user's subscription
 *
 * Request body:
 * {
 *   immediately: boolean - If true, cancel now. If false, cancel at period end.
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = CancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { immediately } = parsed.data;

    // Get user's subscription
    const subscription = await getOrCreateSubscription(user.id);

    if (subscription.plan === "free") {
      return NextResponse.json(
        { error: "You are already on the free plan" },
        { status: 400 }
      );
    }

    if (!subscription.dodoSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    // Cancel in DodoPayments
    await cancelSubscription(subscription.dodoSubscriptionId, immediately);

    // Update local subscription record
    await connectToDatabase();

    if (immediately) {
      // Immediately downgrade to free
      await Subscription.findOneAndUpdate(
        { userId: user.id },
        {
          $set: {
            plan: "free",
            creditTierIndex: 0,
            monthlyCredits: PLAN_LIMITS.free.monthlyCredits,
            creditsRemaining: Math.min(
              subscription.creditsRemaining,
              PLAN_LIMITS.free.monthlyCredits
            ),
            status: "canceled",
            cancelAtPeriodEnd: false,
            dodoSubscriptionId: undefined,
            dodoProductId: undefined,
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: "Your subscription has been cancelled",
        effectiveDate: new Date().toISOString(),
        newPlan: "free",
      });
    } else {
      // Mark as canceling at period end
      await Subscription.findOneAndUpdate(
        { userId: user.id },
        {
          $set: {
            cancelAtPeriodEnd: true,
          },
        }
      );

      return NextResponse.json({
        success: true,
        message: "Your subscription will be cancelled at the end of your billing period",
        effectiveDate: subscription.periodEnd,
        newPlan: "free",
      });
    }
  } catch (error) {
    console.error("Error cancelling subscription:", error);

    if (error instanceof Error) {
      if (error.message.includes("not configured") || error.message.includes("API key")) {
        return NextResponse.json(
          { error: "Billing system not configured" },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }
}
