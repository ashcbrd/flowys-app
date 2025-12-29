import mongoose, { Schema, Model } from "mongoose";

// Maximum number of trial executions allowed per listing per user
export const MAX_TRIAL_EXECUTIONS = 5;

export interface IListingTrial {
  _id: string;
  userId: string;
  listingId: string;
  executionCount: number;
  lastExecutedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ListingTrialSchema = new Schema<IListingTrial>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    listingId: { type: String, required: true, ref: "MarketplaceListing" },
    executionCount: { type: Number, default: 0, min: 0, max: MAX_TRIAL_EXECUTIONS },
    lastExecutedAt: { type: Date },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// Compound index for efficient lookups
ListingTrialSchema.index({ userId: 1, listingId: 1 }, { unique: true });

/**
 * Get remaining trial count for a user on a listing
 */
export async function getRemainingTrials(
  userId: string,
  listingId: string
): Promise<number> {
  const trial = await ListingTrial.findOne({ userId, listingId });
  if (!trial) {
    return MAX_TRIAL_EXECUTIONS;
  }
  return Math.max(0, MAX_TRIAL_EXECUTIONS - trial.executionCount);
}

/**
 * Check if user can execute a trial
 */
export async function canExecuteTrial(
  userId: string,
  listingId: string
): Promise<boolean> {
  const remaining = await getRemainingTrials(userId, listingId);
  return remaining > 0;
}

/**
 * Record a trial execution
 */
export async function recordTrialExecution(
  userId: string,
  listingId: string
): Promise<{ success: boolean; remaining: number }> {
  const { v4: uuidv4 } = await import("uuid");

  const trial = await ListingTrial.findOneAndUpdate(
    { userId, listingId },
    {
      $inc: { executionCount: 1 },
      $set: { lastExecutedAt: new Date() },
      $setOnInsert: { _id: uuidv4() },
    },
    { upsert: true, new: true }
  );

  if (trial.executionCount > MAX_TRIAL_EXECUTIONS) {
    // Rollback if exceeded
    await ListingTrial.findOneAndUpdate(
      { userId, listingId },
      { $inc: { executionCount: -1 } }
    );
    return { success: false, remaining: 0 };
  }

  return {
    success: true,
    remaining: MAX_TRIAL_EXECUTIONS - trial.executionCount,
  };
}

export const ListingTrial: Model<IListingTrial> =
  mongoose.models.ListingTrial ||
  mongoose.model<IListingTrial>("ListingTrial", ListingTrialSchema);
