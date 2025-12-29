import { getDodoClient } from "./dodo-client";
import { v4 as uuidv4 } from "uuid";
import {
  connectToDatabase,
  MarketplaceListing,
  Purchase,
  calculatePurchaseFees,
} from "@/lib/db";
import { copyWorkflowToBuyer, hasUserPurchased } from "@/lib/marketplace/copy-workflow";

/**
 * Create a DodoPayments product for a marketplace listing
 */
export async function createDodoProductForListing(params: {
  listingId: string;
  title: string;
  description: string;
  priceInCents: number;
}): Promise<string> {
  const { listingId, title, description, priceInCents } = params;

  const client = getDodoClient();

  const product = await client.products.create({
    name: title.substring(0, 100),
    description: description.substring(0, 500) || "Workflow from marketplace",
    price: {
      currency: "USD",
      discount: 0,
      price: priceInCents,
      purchasing_power_parity: false,
      type: "one_time_price",
    },
    tax_category: "digital_products",
  });

  return product.product_id;
}

/**
 * Update a DodoPayments product price for a marketplace listing
 */
export async function updateDodoProductPrice(params: {
  dodoProductId: string;
  priceInCents: number;
}): Promise<void> {
  const { dodoProductId, priceInCents } = params;

  const client = getDodoClient();

  await client.products.update(dodoProductId, {
    price: {
      currency: "USD",
      discount: 0,
      price: priceInCents,
      purchasing_power_parity: false,
      type: "one_time_price",
    },
  });
}

/**
 * Create a checkout session for marketplace purchase
 */
export async function createMarketplaceCheckout(params: {
  buyerId: string;
  buyerEmail: string;
  listingId: string;
  successUrl: string;
  cancelUrl?: string;
}): Promise<{ checkoutUrl: string; purchaseId: string }> {
  const { buyerId, buyerEmail, listingId, successUrl } = params;

  await connectToDatabase();

  // Get the listing
  const listing = await MarketplaceListing.findById(listingId);
  if (!listing) {
    throw new Error("Listing not found");
  }

  if (listing.status !== "published") {
    throw new Error("Listing is not available for purchase");
  }

  // Create DodoPayments product if it doesn't exist (for older listings)
  let dodoProductId = listing.dodoProductId;
  if (!dodoProductId) {
    try {
      dodoProductId = await createDodoProductForListing({
        listingId,
        title: listing.title,
        description: listing.description,
        priceInCents: listing.price,
      });
      // Save the product ID to the listing for future purchases
      await MarketplaceListing.findByIdAndUpdate(listingId, { dodoProductId });
    } catch (error) {
      console.error("Failed to create DodoPayments product:", error);
      throw new Error("Failed to configure payment. Please try again.");
    }
  }

  // Check if buyer is the seller
  if (listing.sellerId === buyerId) {
    throw new Error("Cannot purchase your own listing");
  }

  // Check if already purchased
  const alreadyPurchased = await hasUserPurchased(buyerId, listingId);
  if (alreadyPurchased) {
    throw new Error("You have already purchased this workflow");
  }

  // Calculate fees
  const { amount, platformFee, sellerPayout } = calculatePurchaseFees(listing.price);

  // Create pending purchase record
  const purchaseId = uuidv4();

  // Create DodoPayments checkout session using the listing's product
  const client = getDodoClient();

  const session = await client.checkoutSessions.create({
    product_cart: [
      {
        product_id: dodoProductId,
        quantity: 1,
      },
    ],
    customer: {
      email: buyerEmail,
    },
    return_url: successUrl.replace("{purchaseId}", purchaseId),
    metadata: {
      type: "marketplace_purchase",
      purchaseId,
      listingId,
      buyerId,
      sellerId: listing.sellerId,
      amount: amount.toString(),
      title: listing.title,
    },
  });

  // Create the purchase record after successful checkout session creation
  await Purchase.create({
    _id: purchaseId,
    buyerId,
    sellerId: listing.sellerId,
    listingId,
    paymentId: session.session_id,
    amount,
    platformFee,
    sellerPayout,
    currency: listing.currency,
    status: "pending",
  });

  return {
    checkoutUrl: session.checkout_url || "",
    purchaseId,
  };
}

/**
 * Complete a marketplace purchase after successful payment
 */
export async function completeMarketplacePurchase(purchaseId: string): Promise<string> {
  console.log(`[completeMarketplacePurchase] Starting for purchaseId: ${purchaseId}`);

  await connectToDatabase();

  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) {
    console.error(`[completeMarketplacePurchase] Purchase not found: ${purchaseId}`);
    throw new Error("Purchase not found");
  }

  console.log(`[completeMarketplacePurchase] Found purchase:`, {
    id: purchase._id,
    status: purchase.status,
    listingId: purchase.listingId,
    buyerId: purchase.buyerId,
  });

  if (purchase.status === "completed") {
    console.log(`[completeMarketplacePurchase] Already completed, returning existing workflow`);
    return purchase.copiedWorkflowId || "";
  }

  // Copy the workflow to the buyer
  console.log(`[completeMarketplacePurchase] Copying workflow to buyer...`);
  const workflowId = await copyWorkflowToBuyer(
    purchase.listingId,
    purchase.buyerId,
    purchaseId
  );
  console.log(`[completeMarketplacePurchase] Workflow copied: ${workflowId}`);

  // Update purchase status
  await Purchase.findByIdAndUpdate(purchaseId, {
    status: "completed",
    completedAt: new Date(),
    copiedWorkflowId: workflowId,
  });
  console.log(`[completeMarketplacePurchase] Purchase status updated to completed`);

  // Update listing purchase count
  await MarketplaceListing.findByIdAndUpdate(purchase.listingId, {
    $inc: { purchaseCount: 1 },
  });

  // Update seller stats
  const { SellerProfile } = await import("@/lib/db");
  await SellerProfile.findOneAndUpdate(
    { userId: purchase.sellerId },
    {
      $inc: {
        totalSales: 1,
        totalEarnings: purchase.sellerPayout,
      },
    }
  );

  console.log(`[completeMarketplacePurchase] Completed successfully for ${purchaseId}`);
  return workflowId;
}

/**
 * Handle refund for a marketplace purchase
 */
export async function refundMarketplacePurchase(purchaseId: string): Promise<void> {
  await connectToDatabase();

  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) {
    throw new Error("Purchase not found");
  }

  // Update purchase status
  await Purchase.findByIdAndUpdate(purchaseId, {
    status: "refunded",
  });

  // Decrement seller stats if purchase was completed
  if (purchase.status === "completed") {
    const { SellerProfile } = await import("@/lib/db");
    await SellerProfile.findOneAndUpdate(
      { userId: purchase.sellerId },
      {
        $inc: {
          totalSales: -1,
          totalEarnings: -purchase.sellerPayout,
        },
      }
    );

    // Decrement listing purchase count
    await MarketplaceListing.findByIdAndUpdate(purchase.listingId, {
      $inc: { purchaseCount: -1 },
    });
  }
}

/**
 * Get purchase by payment ID (for webhook handling)
 */
export async function getPurchaseByPaymentId(paymentId: string): Promise<typeof Purchase.prototype | null> {
  await connectToDatabase();
  return Purchase.findOne({ paymentId });
}

/**
 * Complete a cart purchase (multiple items) after successful payment
 */
export async function completeCartPurchase(
  purchaseIdsJson: string,
  buyerId: string
): Promise<{ successful: string[]; failed: string[] }> {
  await connectToDatabase();

  const purchaseIds = JSON.parse(purchaseIdsJson) as string[];
  const successful: string[] = [];
  const failed: string[] = [];

  // Process each purchase individually
  for (const purchaseId of purchaseIds) {
    try {
      await completeMarketplacePurchase(purchaseId);
      successful.push(purchaseId);
    } catch (error) {
      console.error(`Failed to complete purchase ${purchaseId}:`, error);
      failed.push(purchaseId);
      // Mark as failed but continue with others
      await Purchase.findByIdAndUpdate(purchaseId, {
        status: "failed",
        failureReason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Clear cart after processing (regardless of partial failures)
  const { Cart } = await import("@/lib/db");
  await Cart.findOneAndUpdate(
    { userId: buyerId },
    { $set: { items: [] } }
  );

  return { successful, failed };
}
