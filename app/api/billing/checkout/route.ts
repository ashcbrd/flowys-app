import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { createCheckoutSession } from "@/lib/payments";
import { CREDIT_TIERS, type PlanType } from "@/lib/db/models/Subscription";

const CheckoutSchema = z.object({
  plan: z.enum(["builder", "team"]),
  tierIndex: z.number().int().min(0).max(CREDIT_TIERS.length - 1),
  returnUrl: z.string().optional(),
});

/**
 * POST /api/billing/checkout
 *
 * Create a checkout session for subscription purchase
 *
 * Request body:
 * {
 *   plan: "builder" | "team",
 *   tierIndex: 0-6 (index into CREDIT_TIERS)
 * }
 *
 * Response:
 * {
 *   checkoutUrl: string,
 *   sessionId: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CheckoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { plan, tierIndex, returnUrl } = parsed.data;
    const tier = CREDIT_TIERS[tierIndex];

    // Build URLs - use returnUrl if provided, otherwise default to settings page
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const baseReturnUrl = returnUrl || `${origin}/settings/subscription`;

    // Add status query param to the return URL
    const successUrl = baseReturnUrl.includes("?")
      ? `${baseReturnUrl}&status=success`
      : `${baseReturnUrl}?status=success`;
    const cancelUrl = baseReturnUrl.includes("?")
      ? `${baseReturnUrl}&status=canceled`
      : `${baseReturnUrl}?status=canceled`;

    const session = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email || "",
      userName: user.name || undefined,
      plan: plan as PlanType,
      tierIndex,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      plan,
      tierIndex,
      credits: tier.credits,
      price: plan === "builder" ? tier.builderPrice : tier.teamPrice,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);

    // Check if it's a product ID configuration error
    if (error instanceof Error && error.message.includes("Product ID not configured")) {
      return NextResponse.json(
        {
          error: "Payment products not configured",
          details: "DodoPayments product IDs are not set up. Please configure the product IDs in your .env file.",
          missingEnvVar: error.message.split(": ")[1],
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
