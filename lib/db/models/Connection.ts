import mongoose, { Schema, Model } from "mongoose";
import crypto from "crypto";

export interface IConnection {
  _id: string;
  userId: string; // Owner of the connection
  integrationId: string;
  name: string;

  // Encrypted credentials
  encryptedCredentials: string;
  credentialsIv: string;
  credentialsSalt: string; // Random salt for key derivation

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
    userId: { type: String, required: true, index: true },
    integrationId: { type: String, required: true, index: true },
    name: { type: String, required: true },

    encryptedCredentials: { type: String, required: true },
    credentialsIv: { type: String, required: true },
    credentialsSalt: { type: String, required: false }, // Optional for backward compatibility

    metadata: { type: Schema.Types.Mixed },

    enabled: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true }
);

// Compound index for listing connections
ConnectionSchema.index({ integrationId: 1, createdAt: -1 });

// Legacy static salt for backward compatibility with existing data
const LEGACY_SALT = "salt";

/**
 * Get and validate the encryption key from environment
 * Throws an error if the key is missing or invalid
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  if (key.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY must be at least 32 characters long. " +
      "Generate one with: openssl rand -base64 32"
    );
  }

  return key;
}

/**
 * Encrypt credentials before storing
 * Uses random salt and IV for each encryption
 */
export function encryptCredentials(credentials: Record<string, unknown>): {
  encrypted: string;
  iv: string;
  salt: string;
} {
  const encryptionKey = getEncryptionKey();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  const jsonStr = JSON.stringify(credentials);
  let encrypted = cipher.update(jsonStr, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    salt: salt.toString("hex"),
  };
}

/**
 * Decrypt stored credentials
 * Supports both new format (with salt) and legacy format (static salt)
 */
export function decryptCredentials(
  encrypted: string,
  iv: string,
  salt?: string
): Record<string, unknown> {
  const encryptionKey = getEncryptionKey();

  // Use provided salt or fall back to legacy static salt for old data
  const saltBuffer = salt
    ? Buffer.from(salt, "hex")
    : Buffer.from(LEGACY_SALT, "utf8");

  const key = crypto.scryptSync(encryptionKey, saltBuffer, 32);
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
