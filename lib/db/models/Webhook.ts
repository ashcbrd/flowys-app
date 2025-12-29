import mongoose, { Schema, Document, Model } from "mongoose";

export type WebhookEvent =
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "node.started"
  | "node.completed"
  | "node.failed"
  | "manual";

export type WebhookType = "incoming" | "outgoing";

export interface IWebhook extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  type: WebhookType;
  workflowId?: string;

  // Incoming webhook config
  slug?: string; // Unique URL slug for incoming webhooks
  secret?: string; // HMAC secret for signature verification

  // Outgoing webhook config
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  events?: WebhookEvent[];

  // Common
  enabled: boolean;
  retryCount: number;
  retryDelay: number; // in milliseconds
  timeout: number; // in milliseconds

  // Metadata
  lastTriggeredAt?: Date;
  successCount: number;
  failureCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<IWebhook>(
  {
    name: { type: String, required: true },
    description: { type: String },
    type: {
      type: String,
      enum: ["incoming", "outgoing"],
      required: true
    },
    workflowId: {
      type: String,
      ref: "Workflow",
      index: true
    },

    // Incoming webhook config
    slug: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    secret: { type: String },

    // Outgoing webhook config
    url: { type: String },
    method: {
      type: String,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      default: "POST"
    },
    headers: { type: Map, of: String, default: {} },
    events: [{
      type: String,
      enum: [
        "workflow.started",
        "workflow.completed",
        "workflow.failed",
        "node.started",
        "node.completed",
        "node.failed",
        "manual"
      ]
    }],

    // Common
    enabled: { type: Boolean, default: true },
    retryCount: { type: Number, default: 3 },
    retryDelay: { type: Number, default: 1000 },
    timeout: { type: Number, default: 30000 },

    // Metadata
    lastTriggeredAt: { type: Date },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Generate unique slug for incoming webhooks
WebhookSchema.pre("save", function(next) {
  if (this.type === "incoming" && !this.slug) {
    this.slug = generateSlug();
  }
  if (this.type === "incoming" && !this.secret) {
    this.secret = generateSecret();
  }
  next();
});

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 24; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

function generateSecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let secret = "whsec_";
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

export const Webhook: Model<IWebhook> =
  mongoose.models.Webhook || mongoose.model<IWebhook>("Webhook", WebhookSchema);
