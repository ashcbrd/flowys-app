import { NextResponse } from "next/server";
import { PLAN_LIMITS, CREDIT_TIERS, CREDIT_COSTS } from "@/lib/subscription";

/**
 * GET /api/subscription/plans
 * Get available plans and pricing tiers (public endpoint)
 */
export async function GET() {
  return NextResponse.json({
    plans: {
      free: {
        name: "Free",
        description: "Perfect for getting started. No strings attached.",
        limits: PLAN_LIMITS.free,
        price: 0,
      },
      builder: {
        name: "Builder",
        description: "For serious builders who want the full toolkit.",
        limits: {
          ...PLAN_LIMITS.builder,
          monthlyCredits: "Based on selected tier",
        },
        tiers: CREDIT_TIERS.map((tier, index) => ({
          index,
          credits: tier.credits,
          price: tier.builderPrice,
        })),
      },
      team: {
        name: "Team",
        description: "For teams that need no limits and priority support.",
        limits: {
          ...PLAN_LIMITS.team,
          monthlyCredits: "Based on selected tier",
        },
        tiers: CREDIT_TIERS.map((tier, index) => ({
          index,
          credits: tier.credits,
          price: tier.teamPrice,
        })),
      },
    },
    creditCosts: CREDIT_COSTS,
    creditTiers: CREDIT_TIERS,
  });
}
