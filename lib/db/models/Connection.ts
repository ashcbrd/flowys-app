import mongoose, { Schema, Model } from "mongoose";
import crypto from "crypto";

export interface IConnection {
  _id: string;
  integrationId: string;
  name: string;

  // Encrypted credentials
  encryptedCredentials: string;
  credentialsIv: string;

  // Metadata from validation (e.g., user email, workspace name)
  metadata?: Record<string, unknown>;

  // Status
  enabled: boolean;
  lastUsedAt?: Date;
  lastError?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ConnectionSchema = new Schema<IConnection>(
  {
    _id: { type: String, required: true },
    integrationId: { type: String, required: true, index: true },
    name: { type: String, required: true },

    encryptedCredentials: { type: String, required: true },
    credentialsIv: { type: String, required: true },

    metadata: { type: Schema.Types.Mixed },

    enabled: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true }
);

// Compound index for listing connections
ConnectionSchema.index({ integrationId: 1, createdAt: -1 });

// Encryption key from environment
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key-change-in-production-32ch";

/**
 * Encrypt credentials before storing
 */
export function encryptCredentials(credentials: Record<string, unknown>): {
  encrypted: string;
  iv: string;
} {
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  const jsonStr = JSON.stringify(credentials);
  let encrypted = cipher.update(jsonStr, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypt stored credentials
 */
export function decryptCredentials(
  encrypted: string,
  iv: string
): Record<string, unknown> {
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    key,
    Buffer.from(iv, "hex")
  );

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

export const Connection: Model<IConnection> =
  mongoose.models.Connection ||
  mongoose.model<IConnection>("Connection", ConnectionSchema);
