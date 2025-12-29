import mongoose, { Schema, Document, Model } from "mongoose";

export type WebhookLogStatus = "pending" | "success" | "failed" | "retrying";

export interface IWebhookLog extends Document {
  _id: mongoose.Types.ObjectId;
  webhookId: mongoose.Types.ObjectId;
  workflowId?: mongoose.Types.ObjectId;
  executionId?: mongoose.Types.ObjectId;

  // Request details
  direction: "incoming" | "outgoing";
  event?: string;
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: Record<string, unknown>;

  // Response details
  status: WebhookLogStatus;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  error?: string;

  // Timing
  duration?: number; // in milliseconds
  attemptNumber: number;
  nextRetryAt?: Date;

  // Source info (for incoming)
  sourceIp?: string;
  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    webhookId: {
      type: Schema.Types.ObjectId,
      ref: "Webhook",
      required: true,
      index: true
    },
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: "Workflow",
      index: true
    },
    executionId: {
      type: Schema.Types.ObjectId,
      ref: "Execution",
      index: true
    },

    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      required: true
    },
    event: { type: String },
    method: { type: String, required: true },
    url: { type: String, required: true },
    requestHeaders: { type: Map, of: String },
    requestBody: { type: Schema.Types.Mixed },

    status: {
      type: String,
      enum: ["pending", "success", "failed", "retrying"],
      default: "pending"
    },
    statusCode: { type: Number },
    responseHeaders: { type: Map, of: String },
    responseBody: { type: String },
    error: { type: String },

    duration: { type: Number },
    attemptNumber: { type: Number, default: 1 },
    nextRetryAt: { type: Date },

    sourceIp: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// TTL index to auto-delete old logs after 30 days
WebhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Compound indexes for efficient querying
WebhookLogSchema.index({ webhookId: 1, createdAt: -1 });
WebhookLogSchema.index({ workflowId: 1, createdAt: -1 });
WebhookLogSchema.index({ status: 1, nextRetryAt: 1 });

export const WebhookLog: Model<IWebhookLog> =
  mongoose.models.WebhookLog || mongoose.model<IWebhookLog>("WebhookLog", WebhookLogSchema);
