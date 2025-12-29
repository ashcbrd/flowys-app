import mongoose, { Schema, Model } from "mongoose";

export interface ICartItem {
  listingId: string;
  priceSnapshot: number; // Price in cents at add time
  currency: string;
  addedAt: Date;
}

export interface ICart {
  _id: string;
  userId: string;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    listingId: { type: String, required: true, ref: "MarketplaceListing" },
    priceSnapshot: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "USD" },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CartSchema = new Schema<ICart>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, unique: true, index: true },
    items: { type: [CartItemSchema], default: [] },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// Indexes (userId unique index is defined inline in schema)
CartSchema.index({ "items.listingId": 1 });

export const Cart: Model<ICart> =
  mongoose.models.Cart || mongoose.model<ICart>("Cart", CartSchema);
