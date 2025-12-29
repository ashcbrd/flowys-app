import mongoose, { Schema, Document, Model } from "mongoose";
import crypto from "crypto";

export type ApiKeyScope =
  | "workflows:read"
  | "workflows:write"
  | "workflows:execute"
  | "executions:read"
  | "webhooks:read"
  | "webhooks:write"
  | "full_access";

export interface IApiKey extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;

  // Key data (prefix is stored, full key shown only on creation)
  keyPrefix: string; // First 8 chars for identification
  keyHash: string; // SHA-256 hash of full key

  // Permissions
  scopes: ApiKeyScope[];

  // Rate limiting
  rateLimit: number; // requests per minute
  rateLimitWindow: number; // window in seconds

  // Restrictions
  allowedIps?: string[];
  allowedOrigins?: string[];

  // Metadata
  enabled: boolean;
  lastUsedAt?: Date;
  usageCount: number;
  expiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    name: { type: String, required: true },
    description: { type: String },

    keyPrefix: { type: String, required: true, index: true },
    keyHash: { type: String, required: true },

    scopes: [{
      type: String,
      enum: [
        "workflows:read",
        "workflows:write",
        "workflows:execute",
        "executions:read",
        "webhooks:read",
        "webhooks:write",
        "full_access"
      ]
    }],

    rateLimit: { type: Number, default: 60 },
    rateLimitWindow: { type: Number, default: 60 },

    allowedIps: [{ type: String }],
    allowedOrigins: [{ type: String }],

    enabled: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    usageCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

// Index for quick lookup
ApiKeySchema.index({ keyHash: 1 }, { unique: true });
ApiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ApiKey: Model<IApiKey> =
  mongoose.models.ApiKey || mongoose.model<IApiKey>("ApiKey", ApiKeySchema);

// Utility functions for API key management
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = "ask_";
  const randomPart = crypto.randomBytes(32).toString("base64url");
  const key = `${prefix}${randomPart}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");

  return {
    key,
    prefix: key.substring(0, 12),
    hash
  };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function verifyApiKey(providedKey: string, storedHash: string): boolean {
  const providedHash = hashApiKey(providedKey);
  return crypto.timingSafeEqual(
    Buffer.from(providedHash),
    Buffer.from(storedHash)
  );
}
