import mongoose, { Schema, Model } from "mongoose";

export type PurchaseStatus = "pending" | "completed" | "refunded" | "disputed" | "failed";

// Platform commission rate (5% - seller-friendly)
export const PLATFORM_COMMISSION_RATE = 0.05;

export interface IPurchase {
  _id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;

  // Payment details
  paymentId: string; // DodoPayments payment ID
  amount: number; // Total paid (cents)
  platformFee: number; // Commission (cents)
  sellerPayout: number; // Seller receives (cents)
  currency: string;

  // Status
  status: PurchaseStatus;

  // Copied workflow reference
  copiedWorkflowId?: string; // Created after purchase completes

  // Failure tracking (for cart purchases)
  failureReason?: string;

  createdAt: Date;
  completedAt?: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    _id: { type: String, required: true },
    buyerId: { type: String, required: true, index: true },
    sellerId: { type: String, required: true, index: true },
    listingId: { type: String, required: true, ref: "MarketplaceListing" },

    // Payment details
    paymentId: { type: String, required: true, unique: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    sellerPayout: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "USD" },

    // Status
    status: {
      type: String,
      enum: ["pending", "completed", "refunded", "disputed", "failed"],
      default: "pending",
    },

    // Copied workflow reference
    copiedWorkflowId: { type: String, ref: "Workflow" },

    // Failure tracking
    failureReason: { type: String },

    completedAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  }
);

// Indexes
PurchaseSchema.index({ buyerId: 1, createdAt: -1 });
PurchaseSchema.index({ sellerId: 1, createdAt: -1 });
PurchaseSchema.index({ listingId: 1, buyerId: 1 }); // For checking duplicate purchases
PurchaseSchema.index({ status: 1 });

// Helper function to calculate fees
export function calculatePurchaseFees(priceInCents: number): {
  amount: number;
  platformFee: number;
  sellerPayout: number;
} {
  const amount = priceInCents;
  const platformFee = Math.round(amount * PLATFORM_COMMISSION_RATE);
  const sellerPayout = amount - platformFee;

  return { amount, platformFee, sellerPayout };
}

export const Purchase: Model<IPurchase> =
  mongoose.models.Purchase ||
  mongoose.model<IPurchase>("Purchase", PurchaseSchema);
