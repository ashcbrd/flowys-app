import mongoose, { Schema, Model } from "mongoose";

export type SellerStatus = "active" | "suspended";

export interface ISellerProfile {
  _id: string;
  userId: string;

  // Display info
  displayName: string;
  bio?: string;
  avatarUrl?: string;

  // Payout info (for future payouts)
  payoutEmail?: string;

  // Stats
  totalSales: number;
  totalEarnings: number; // In cents
  averageRating: number;
  listingCount: number;

  // Status
  status: SellerStatus;
  verifiedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SellerProfileSchema = new Schema<ISellerProfile>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, unique: true, index: true },

    // Display info
    displayName: { type: String, required: true, maxlength: 50 },
    bio: { type: String, maxlength: 500 },
    avatarUrl: { type: String },

    // Payout info
    payoutEmail: { type: String },

    // Stats
    totalSales: { type: Number, default: 0, min: 0 },
    totalEarnings: { type: Number, default: 0, min: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    listingCount: { type: Number, default: 0, min: 0 },

    // Status
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    verifiedAt: { type: Date },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// Indexes
SellerProfileSchema.index({ status: 1, totalSales: -1 });
SellerProfileSchema.index({ status: 1, averageRating: -1 });

export const SellerProfile: Model<ISellerProfile> =
  mongoose.models.SellerProfile ||
  mongoose.model<ISellerProfile>("SellerProfile", SellerProfileSchema);
