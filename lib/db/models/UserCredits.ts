import mongoose, { Schema, Model } from "mongoose";

export const DEFAULT_CREDITS = 50;

export interface IUserCredits {
  _id: string;
  userId: string;
  creditsRemaining: number;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserCreditsSchema = new Schema<IUserCredits>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, unique: true, index: true },
    creditsRemaining: { type: Number, required: true, default: DEFAULT_CREDITS },
    creditsUsed: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, _id: false }
);

export const UserCredits: Model<IUserCredits> =
  mongoose.models.UserCredits ||
  mongoose.model<IUserCredits>("UserCredits", UserCreditsSchema);
