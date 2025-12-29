import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { createCustomerPortalSession, findCustomerByEmail } from "@/lib/payments";
import { getOrCreateSubscription } from "@/lib/subscription";
import { connectToDatabase, Subscription } from "@/lib/db";

/**
 * POST /api/billing/portal
 *
 * Create a customer portal session for managing subscription
 *
 * Response:
 * {
 *   portalUrl: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's subscription
    const subscription = await getOrCreateSubscription(user.id);

    let customerId = subscription.dodoCustomerId;

    // If no customer ID stored, try to find by email
    if (!customerId && user.email) {
      try {
        const customer = await findCustomerByEmail(user.email);
        if (customer) {
          customerId = customer.customerId;
          // Store for future use
          await connectToDatabase();
          await Subscription.findOneAndUpdate(
            { userId: user.id },
            { $set: { dodoCustomerId: customerId } }
          );
        }
      } catch (lookupError) {
        console.error("Error looking up customer:", lookupError);
      }
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "No billing account found. Please subscribe to a plan first." },
        { status: 400 }
      );
    }

    // Build return URL
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnUrl = `${origin}/settings?tab=billing`;

    const session = await createCustomerPortalSession({
      customerId,
      returnUrl,
    });

    return NextResponse.json({
      portalUrl: session.portalUrl,
    });
  } catch (error) {
    console.error("Error creating portal session:", error);

    // Check for specific error types
    if (error instanceof Error) {
      // API key not configured
      if (error.message.includes("not configured") || error.message.includes("API key")) {
        return NextResponse.json(
          { error: "Billing system not configured. Please contact support." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create portal session. Please try again later." },
      { status: 500 }
    );
  }
}
