import mongoose, { Schema, Model } from "mongoose";

export interface IRateLimit {
  _id: string; // Composite key: "type:identifier" (e.g., "apikey:abc123" or "ip:192.168.1.1")
  count: number;
  windowStart: Date;
  windowEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
  },
  {
    timestamps: true,
    _id: false,
  }
);

// TTL index to automatically delete expired rate limit records
// Records are deleted 1 hour after windowEnd to allow for some buffer
RateLimitSchema.index({ windowEnd: 1 }, { expireAfterSeconds: 3600 });

export const RateLimit: Model<IRateLimit> =
  mongoose.models.RateLimit ||
  mongoose.model<IRateLimit>("RateLimit", RateLimitSchema);

/**
 * Check and increment rate limit counter
 * Returns { allowed, remaining, resetAt }
 */
export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: Date;
}> {
  const { key, limit, windowSeconds } = params;
  const now = new Date();
  const windowMs = windowSeconds * 1000;

  // Use findOneAndUpdate with upsert for atomic operation
  const result = await RateLimit.findOneAndUpdate(
    {
      _id: key,
      windowEnd: { $gt: now }, // Only match if window hasn't expired
    },
    {
      $inc: { count: 1 },
    },
    {
      new: true,
      upsert: false,
    }
  );

  if (result) {
    // Window is still active, check if limit exceeded
    const allowed = result.count <= limit;
    return {
      allowed,
      count: result.count,
      remaining: Math.max(0, limit - result.count),
      resetAt: result.windowEnd,
    };
  }

  // No active window found, create new one
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + windowMs);

  try {
    // Try to create a new rate limit record
    await RateLimit.findOneAndUpdate(
      { _id: key },
      {
        $set: {
          count: 1,
          windowStart,
          windowEnd,
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    return {
      allowed: true,
      count: 1,
      remaining: limit - 1,
      resetAt: windowEnd,
    };
  } catch (error) {
    // Handle race condition where another request created the record
    const existing = await RateLimit.findById(key);
    if (existing && existing.windowEnd > now) {
      // Increment the existing record
      await RateLimit.updateOne({ _id: key }, { $inc: { count: 1 } });
      const newCount = existing.count + 1;
      return {
        allowed: newCount <= limit,
        count: newCount,
        remaining: Math.max(0, limit - newCount),
        resetAt: existing.windowEnd,
      };
    }
    throw error;
  }
}

/**
 * Check rate limit without incrementing (for read-only checks)
 */
export async function getRateLimitStatus(key: string): Promise<{
  count: number;
  resetAt: Date | null;
} | null> {
  const now = new Date();
  const result = await RateLimit.findOne({
    _id: key,
    windowEnd: { $gt: now },
  });

  if (!result) {
    return null;
  }

  return {
    count: result.count,
    resetAt: result.windowEnd,
  };
}
