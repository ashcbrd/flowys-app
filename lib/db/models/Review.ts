import mongoose, { Schema, Model } from "mongoose";

export type ReviewStatus = "published" | "hidden" | "flagged";

export interface IReview {
  _id: string;
  purchaseId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;

  rating: number; // 1-5
  title?: string;
  comment?: string;

  // Moderation
  status: ReviewStatus;

  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    _id: { type: String, required: true },
    purchaseId: { type: String, required: true, unique: true, ref: "Purchase" },
    listingId: { type: String, required: true, ref: "MarketplaceListing" },
    buyerId: { type: String, required: true, index: true },
    sellerId: { type: String, required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 100 },
    comment: { type: String, maxlength: 1000 },

    // Moderation
    status: {
      type: String,
      enum: ["published", "hidden", "flagged"],
      default: "published",
    },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// Indexes
ReviewSchema.index({ listingId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ buyerId: 1, createdAt: -1 });

export const Review: Model<IReview> =
  mongoose.models.Review || mongoose.model<IReview>("Review", ReviewSchema);
