import { dodoClient, getWebhookSecret, IS_PRODUCTION } from "./dodo-client";
import { connectToDatabase, Subscription } from "@/lib/db";
import { CREDIT_TIERS, PLAN_LIMITS, type PlanType } from "@/lib/db/models/Subscription";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

// Product IDs mapping - these should be created in DodoPayments dashboard
export interface ProductMapping {
  productId: string;
  plan: PlanType;
  tierIndex: number;
  credits: number;
  price: number;
}

/**
 * Product ID environment variable keys
 * Test mode: DODO_PRODUCT_TEST_{PLAN}_{TIER}
 * Live mode: DODO_PRODUCT_LIVE_{PLAN}_{TIER}
 */
const PRODUCT_ENV_KEYS = {
  builder: [
    { test: "DODO_PRODUCT_TEST_BUILDER_0", live: "DODO_PRODUCT_LIVE_BUILDER_0" },
    { test: "DODO_PRODUCT_TEST_BUILDER_1", live: "DODO_PRODUCT_LIVE_BUILDER_1" },
    { test: "DODO_PRODUCT_TEST_BUILDER_2", live: "DODO_PRODUCT_LIVE_BUILDER_2" },
    { test: "DODO_PRODUCT_TEST_BUILDER_3", live: "DODO_PRODUCT_LIVE_BUILDER_3" },
    { test: "DODO_PRODUCT_TEST_BUILDER_4", live: "DODO_PRODUCT_LIVE_BUILDER_4" },
    { test: "DODO_PRODUCT_TEST_BUILDER_5", live: "DODO_PRODUCT_LIVE_BUILDER_5" },
    { test: "DODO_PRODUCT_TEST_BUILDER_6", live: "DODO_PRODUCT_LIVE_BUILDER_6" },
  ],
  team: [
    { test: "DODO_PRODUCT_TEST_TEAM_0", live: "DODO_PRODUCT_LIVE_TEAM_0" },
    { test: "DODO_PRODUCT_TEST_TEAM_1", live: "DODO_PRODUCT_LIVE_TEAM_1" },
    { test: "DODO_PRODUCT_TEST_TEAM_2", live: "DODO_PRODUCT_LIVE_TEAM_2" },
    { test: "DODO_PRODUCT_TEST_TEAM_3", live: "DODO_PRODUCT_LIVE_TEAM_3" },
    { test: "DODO_PRODUCT_TEST_TEAM_4", live: "DODO_PRODUCT_LIVE_TEAM_4" },
    { test: "DODO_PRODUCT_TEST_TEAM_5", live: "DODO_PRODUCT_LIVE_TEAM_5" },
    { test: "DODO_PRODUCT_TEST_TEAM_6", live: "DODO_PRODUCT_LIVE_TEAM_6" },
  ],
};

/**
 * Get the product ID for a specific plan and tier
 * Uses environment variables based on current mode (test/live)
 */
export function getProductId(plan: PlanType, tierIndex: number): string {
  if (plan === "free") {
    throw new Error("Free plan does not require payment");
  }

  if (tierIndex < 0 || tierIndex >= CREDIT_TIERS.length) {
    throw new Error(`Invalid tier index: ${tierIndex}`);
  }

  const envKeys = PRODUCT_ENV_KEYS[plan]?.[tierIndex];
  if (!envKeys) {
    throw new Error(`No product configuration for ${plan} tier ${tierIndex}`);
  }

  const envKey = IS_PRODUCTION ? envKeys.live : envKeys.test;
  const productId = process.env[envKey];

  if (!productId) {
    throw new Error(`Product ID not configured: ${envKey}`);
  }

  return productId;
}

/**
 * Build reverse mapping of product IDs to plan info
 * Used for parsing webhook events
 */
function buildProductIdMap(): Map<string, { plan: PlanType; tierIndex: number }> {
  const map = new Map<string, { plan: PlanType; tierIndex: number }>();

  (["builder", "team"] as const).forEach((plan) => {
    PRODUCT_ENV_KEYS[plan].forEach((envKeys, tierIndex) => {
      // Add test product ID
      const testId = process.env[envKeys.test];
      if (testId) {
        map.set(testId, { plan, tierIndex });
      }
      // Add live product ID
      const liveId = process.env[envKeys.live];
      if (liveId) {
        map.set(liveId, { plan, tierIndex });
      }
    });
  });

  return map;
}

// Lazy-initialized product ID map
let _productIdMap: Map<string, { plan: PlanType; tierIndex: number }> | null = null;

function getProductIdMap() {
  if (!_productIdMap) {
    _productIdMap = buildProductIdMap();
  }
  return _productIdMap;
}

/**
 * Parse product ID to get plan and tier information
 */
export function parseProductId(productId: string): { plan: PlanType; tierIndex: number } | null {
  return getProductIdMap().get(productId) || null;
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(params: {
  userId: string;
  userEmail: string;
  userName?: string;
  plan: PlanType;
  tierIndex: number;
  successUrl: string;
  cancelUrl?: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const { userId, userEmail, userName, plan, tierIndex, successUrl, cancelUrl } = params;

  if (plan === "free") {
    throw new Error("Cannot create checkout for free plan");
  }

  const productId = getProductId(plan, tierIndex);
  const tier = CREDIT_TIERS[tierIndex];

  if (!tier) {
    throw new Error(`Invalid tier index: ${tierIndex}`);
  }

  // Create checkout session with DodoPayments
  const session = await dodoClient.checkoutSessions.create({
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
      },
    ],
    customer: {
      email: userEmail,
      name: userName || userEmail.split("@")[0],
    },
    return_url: successUrl,
    metadata: {
      userId,
      plan,
      tierIndex: tierIndex.toString(),
      credits: tier.credits.toString(),
    },
  });

  return {
    checkoutUrl: session.checkout_url || "",
    sessionId: session.session_id,
  };
}

/**
 * Create a customer portal session for managing subscription
 */
export async function createCustomerPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ portalUrl: string }> {
  const { customerId } = params;

  const session = await dodoClient.customers.customerPortal.create(customerId, {
    send_email: false,
  });

  return {
    portalUrl: session.link,
  };
}

/**
 * Cancel a subscription
 * @param subscriptionId - The DodoPayments subscription ID
 * @param immediately - If true, cancel immediately. If false, cancel at next billing date.
 */
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = true
): Promise<void> {
  if (immediately) {
    await dodoClient.subscriptions.update(subscriptionId, {
      status: "cancelled",
    });
  } else {
    // Cancel at next billing date - subscription stays active until period ends
    await dodoClient.subscriptions.update(subscriptionId, {
      cancel_at_next_billing_date: true,
    });
  }
}

/**
 * Change subscription plan
 */
export async function changeSubscriptionPlan(params: {
  subscriptionId: string;
  newPlan: PlanType;
  newTierIndex: number;
  proration?: "prorated_immediately" | "full_immediately" | "difference_immediately";
}): Promise<void> {
  const { subscriptionId, newPlan, newTierIndex, proration = "prorated_immediately" } = params;

  if (newPlan === "free") {
    // Cancel subscription to downgrade to free
    await cancelSubscription(subscriptionId);
    return;
  }

  const newProductId = getProductId(newPlan, newTierIndex);

  await dodoClient.subscriptions.changePlan(subscriptionId, {
    product_id: newProductId,
    quantity: 1,
    proration_billing_mode: proration as "prorated_immediately" | "full_immediately",
  });
}

/**
 * Verify webhook signature using Standard Webhooks specification
 * The signature is: HMAC-SHA256(webhook-id.timestamp.payload)
 *
 * @param payload - Raw request body
 * @param signature - webhook-signature header value (format: "v1,{base64signature}")
 * @param webhookId - webhook-id header value
 * @param timestamp - webhook-timestamp header value (Unix seconds)
 * @param webhookSecret - Optional override for webhook secret
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookId?: string,
  timestamp?: string,
  webhookSecret?: string
): boolean {
  try {
    const secret = webhookSecret || getWebhookSecret();

    // If webhookId and timestamp are provided, use Standard Webhooks format
    if (webhookId && timestamp) {
      // Construct the signed message: webhook-id.timestamp.payload
      const signedMessage = `${webhookId}.${timestamp}.${payload}`;

      // Secret might be prefixed with "whsec_" - extract the base64 part
      const secretBytes = secret.startsWith("whsec_")
        ? Buffer.from(secret.slice(6), "base64")
        : Buffer.from(secret, "utf8");

      const expectedSignature = crypto
        .createHmac("sha256", secretBytes)
        .update(signedMessage)
        .digest("base64");

      // Signature header format: "v1,{base64signature}" (may have multiple versions)
      const signatures = signature.split(" ");
      for (const sig of signatures) {
        const [version, value] = sig.split(",");
        if (version === "v1" && value) {
          try {
            if (crypto.timingSafeEqual(
              Buffer.from(value, "base64"),
              Buffer.from(expectedSignature, "base64")
            )) {
              return true;
            }
          } catch {
            // Length mismatch, try next signature
          }
        }
      }
      return false;
    }

    // Fallback: Simple HMAC verification for backwards compatibility
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Webhook event types from DodoPayments
 */
export type DodoWebhookEventType =
  | "subscription.active"
  | "subscription.on_hold"
  | "subscription.failed"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "subscription.updated"
  | "payment.succeeded"
  | "payment.failed"
  | "refund.succeeded"
  | "refund.failed";

export interface DodoWebhookEvent {
  type: DodoWebhookEventType;
  data: {
    payload: {
      subscription_id?: string;
      customer_id?: string;
      product_id?: string;
      payment_id?: string;
      status?: string;
      metadata?: Record<string, string>;
      next_billing_date?: string;
      current_period_start?: string;
      current_period_end?: string;
    };
  };
  created_at: string;
}

/**
 * Handle subscription.active event
 * Called when a subscription is successfully activated
 */
export async function handleSubscriptionActive(event: DodoWebhookEvent): Promise<void> {
  await connectToDatabase();

  const { subscription_id, customer_id, product_id, metadata, current_period_start, current_period_end } =
    event.data.payload;

  if (!subscription_id || !metadata?.userId) {
    console.error("Missing required fields in subscription.active event");
    return;
  }

  const planInfo = product_id ? parseProductId(product_id) : null;
  const plan = planInfo?.plan || (metadata.plan as PlanType) || "builder";
  const tierIndex = planInfo?.tierIndex ?? parseInt(metadata.tierIndex || "0", 10);
  const credits = CREDIT_TIERS[tierIndex]?.credits || CREDIT_TIERS[0].credits;

  const periodStart = current_period_start ? new Date(current_period_start) : new Date();
  const periodEnd = current_period_end
    ? new Date(current_period_end)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await Subscription.findOneAndUpdate(
    { userId: metadata.userId },
    {
      $set: {
        plan,
        creditTierIndex: tierIndex,
        monthlyCredits: credits,
        creditsRemaining: credits,
        creditsUsed: 0,
        periodStart,
        periodEnd,
        status: "active",
        dodoCustomerId: customer_id,
        dodoSubscriptionId: subscription_id,
        dodoProductId: product_id,
        cancelAtPeriodEnd: false,
      },
      $setOnInsert: {
        _id: uuid(),
      },
    },
    { upsert: true, new: true }
  );

  console.log(`Subscription activated for user ${metadata.userId}: ${plan} (tier ${tierIndex})`);
}

/**
 * Handle subscription.renewed event
 * Called when a subscription is renewed for the next billing period
 */
export async function handleSubscriptionRenewed(event: DodoWebhookEvent): Promise<void> {
  await connectToDatabase();

  const { subscription_id, current_period_start, current_period_end } = event.data.payload;

  if (!subscription_id) {
    console.error("Missing subscription_id in subscription.renewed event");
    return;
  }

  const subscription = await Subscription.findOne({ dodoSubscriptionId: subscription_id });

  if (!subscription) {
    console.error(`Subscription not found for renewal: ${subscription_id}`);
    return;
  }

  const periodStart = current_period_start ? new Date(current_period_start) : new Date();
  const periodEnd = current_period_end
    ? new Date(current_period_end)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Reset credits for the new billing period
  subscription.creditsUsed = 0;
  subscription.creditsRemaining = subscription.monthlyCredits;
  subscription.periodStart = periodStart;
  subscription.periodEnd = periodEnd;
  subscription.status = "active";
  await subscription.save();

  console.log(`Subscription renewed for user ${subscription.userId}`);
}

/**
 * Handle subscription.on_hold event
 * Called when a subscription payment fails and is put on hold
 */
export async function handleSubscriptionOnHold(event: DodoWebhookEvent): Promise<void> {
  await connectToDatabase();

  const { subscription_id } = event.data.payload;

  if (!subscription_id) {
    console.error("Missing subscription_id in subscription.on_hold event");
    return;
  }

  await Subscription.findOneAndUpdate(
    { dodoSubscriptionId: subscription_id },
    { $set: { status: "on_hold" } }
  );

  console.log(`Subscription on hold: ${subscription_id}`);
}

/**
 * Handle subscription.failed event
 * Called when subscription creation fails
 */
export async function handleSubscriptionFailed(event: DodoWebhookEvent): Promise<void> {
  await connectToDatabase();

  const { subscription_id, metadata } = event.data.payload;

  if (metadata?.userId) {
    // Revert to free plan if subscription creation fails
    await Subscription.findOneAndUpdate(
      { userId: metadata.userId },
      {
        $set: {
          plan: "free",
          creditTierIndex: 0,
          monthlyCredits: PLAN_LIMITS.free.monthlyCredits,
          creditsRemaining: PLAN_LIMITS.free.monthlyCredits,
          creditsUsed: 0,
          status: "active",
          dodoSubscriptionId: undefined,
          dodoProductId: undefined,
        },
      }
    );

    console.log(`Subscription failed for user ${metadata.userId}, reverted to free plan`);
  }
}

/**
 * Handle subscription.cancelled event
 * Called when a subscription is cancelled
 */
export async function handleSubscriptionCancelled(event: DodoWebhookEvent): Promise<void> {
  await connectToDatabase();

  const { subscription_id } = event.data.payload;

  if (!subscription_id) {
    console.error("Missing subscription_id in subscription.cancelled event");
    return;
  }

  const subscription = await Subscription.findOne({ dodoSubscriptionId: subscription_id });

  if (!subscription) {
    console.error(`Subscription not found for cancellation: ${subscription_id}`);
    return;
  }

  // Downgrade to free plan
  subscription.plan = "free";
  subscription.creditTierIndex = 0;
  subscription.monthlyCredits = PLAN_LIMITS.free.monthlyCredits;
  subscription.creditsRemaining = Math.min(
    subscription.creditsRemaining,
    PLAN_LIMITS.free.monthlyCredits
  );
  subscription.status = "canceled";
  subscription.dodoSubscriptionId = undefined;
  subscription.dodoProductId = undefined;
  await subscription.save();

  console.log(`Subscription cancelled for user ${subscription.userId}, downgraded to free`);
}

/**
 * Handle subscription.updated event
 * Called when a subscription is modified (plan change, etc.)
 */
export async function handleSubscriptionUpdated(event: DodoWebhookEvent): Promise<void> {
  await connectToDatabase();

  const { subscription_id, product_id, status } = event.data.payload;

  if (!subscription_id) {
    console.error("Missing subscription_id in subscription.updated event");
    return;
  }

  const subscription = await Subscription.findOne({ dodoSubscriptionId: subscription_id });

  if (!subscription) {
    console.error(`Subscription not found for update: ${subscription_id}`);
    return;
  }

  // Update plan if product changed
  if (product_id) {
    const planInfo = parseProductId(product_id);
    if (planInfo) {
      const credits = CREDIT_TIERS[planInfo.tierIndex]?.credits || subscription.monthlyCredits;
      subscription.plan = planInfo.plan;
      subscription.creditTierIndex = planInfo.tierIndex;
      subscription.monthlyCredits = credits;
      subscription.dodoProductId = product_id;

      // Adjust remaining credits proportionally if upgrading
      if (credits > subscription.monthlyCredits) {
        const usageRatio = subscription.creditsUsed / subscription.monthlyCredits;
        subscription.creditsRemaining = Math.round(credits * (1 - usageRatio));
      }
    }
  }

  // Update status if changed
  if (status) {
    const statusMap: Record<string, ISubscription["status"]> = {
      active: "active",
      cancelled: "canceled",
      on_hold: "on_hold",
      pending: "pending",
    };
    subscription.status = statusMap[status] || subscription.status;
  }

  await subscription.save();

  console.log(`Subscription updated for user ${subscription.userId}`);
}

// Re-export types
import type { ISubscription } from "@/lib/db/models/Subscription";

/**
 * Handle marketplace payment succeeded event (single item)
 */
export async function handleMarketplacePaymentSucceeded(event: DodoWebhookEvent): Promise<void> {
  const { metadata } = event.data.payload;

  if (!metadata?.purchaseId) {
    console.error("Missing purchaseId in marketplace payment metadata");
    return;
  }

  console.log(`Processing marketplace payment for purchase: ${metadata.purchaseId}`);

  try {
    // Import marketplace functions dynamically to avoid circular dependencies
    const { completeMarketplacePurchase } = await import("./marketplace");
    const workflowId = await completeMarketplacePurchase(metadata.purchaseId);
    console.log(`Marketplace purchase completed: ${metadata.purchaseId}, workflow: ${workflowId}`);
  } catch (error) {
    console.error(`Error completing marketplace purchase ${metadata.purchaseId}:`, error);
    throw error;
  }
}

/**
 * Handle marketplace cart payment succeeded event (multiple items)
 */
export async function handleMarketplaceCartPaymentSucceeded(event: DodoWebhookEvent): Promise<void> {
  const { metadata } = event.data.payload;

  if (!metadata?.purchaseIds || !metadata?.buyerId) {
    console.error("Missing purchaseIds or buyerId in cart payment metadata");
    return;
  }

  console.log(`Processing cart payment for purchases: ${metadata.purchaseIds}`);

  try {
    // Import marketplace functions dynamically to avoid circular dependencies
    const { completeCartPurchase } = await import("./marketplace");
    const result = await completeCartPurchase(metadata.purchaseIds, metadata.buyerId);
    console.log(`Cart purchase completed: ${result.successful.length} successful, ${result.failed.length} failed`);
  } catch (error) {
    console.error(`Error completing cart purchase:`, error);
    throw error;
  }
}

/**
 * Process incoming webhook event
 */
export async function processWebhookEvent(event: DodoWebhookEvent): Promise<void> {
  console.log(`Processing webhook event: ${event.type}`);

  switch (event.type) {
    case "subscription.active":
      await handleSubscriptionActive(event);
      break;
    case "subscription.renewed":
      await handleSubscriptionRenewed(event);
      break;
    case "subscription.on_hold":
      await handleSubscriptionOnHold(event);
      break;
    case "subscription.failed":
      await handleSubscriptionFailed(event);
      break;
    case "subscription.cancelled":
      await handleSubscriptionCancelled(event);
      break;
    case "subscription.updated":
      await handleSubscriptionUpdated(event);
      break;
    case "payment.succeeded":
      console.log("Payment succeeded event payload:", JSON.stringify(event.data.payload, null, 2));
      console.log("Metadata:", event.data.payload.metadata);
      console.log("Metadata type:", event.data.payload.metadata?.type);

      // Check if this is a marketplace purchase
      if (event.data.payload.metadata?.type === "marketplace_purchase") {
        console.log("Detected marketplace_purchase, calling handler...");
        await handleMarketplacePaymentSucceeded(event);
      } else if (event.data.payload.metadata?.type === "marketplace_cart_purchase") {
        console.log("Detected marketplace_cart_purchase, calling handler...");
        await handleMarketplaceCartPaymentSucceeded(event);
      } else {
        // Regular payment succeeded events are informational
        console.log("Payment succeeded (not marketplace):", event.data.payload.payment_id);
      }
      break;
    case "payment.failed":
      // Payment failures are handled by subscription.on_hold
      console.log("Payment failed:", event.data.payload.payment_id);
      break;
    default:
      console.log(`Unhandled webhook event type: ${event.type}`);
  }
}

/**
 * Get all available products for display
 */
export function getAvailableProducts(): ProductMapping[] {
  const products: ProductMapping[] = [];

  // Builder plans
  CREDIT_TIERS.forEach((tier, index) => {
    products.push({
      productId: getProductId("builder", index),
      plan: "builder",
      tierIndex: index,
      credits: tier.credits,
      price: tier.builderPrice,
    });
  });

  // Team plans
  CREDIT_TIERS.forEach((tier, index) => {
    products.push({
      productId: getProductId("team", index),
      plan: "team",
      tierIndex: index,
      credits: tier.credits,
      price: tier.teamPrice,
    });
  });

  return products;
}

/**
 * Find a customer by email address
 * Useful for recovering customer ID if not stored in subscription
 */
export async function findCustomerByEmail(email: string): Promise<{ customerId: string; email: string } | null> {
  try {
    const customers = await dodoClient.customers.list({ email });

    if (customers.items && customers.items.length > 0) {
      const customer = customers.items[0];
      return {
        customerId: customer.customer_id,
        email: customer.email,
      };
    }

    return null;
  } catch (error) {
    console.error("Error finding customer by email:", error);
    return null;
  }
}
