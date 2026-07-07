import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

/**
 * A binary artifact a step produced: a generated image, a composited mockup,
 * an email preview page.
 *
 * These live in their own collection rather than inside execution logs
 * because a run's log document is read every time the history panel opens,
 * and a megabyte of PNG per step would make that panel pay for images nobody
 * asked to see. Steps hand URLs downstream; the bytes are fetched only when a
 * person actually looks.
 *
 * Mongo's 16MB document limit comfortably holds the largest image the
 * pipeline produces (a best-quality generation is around 3MB), so no GridFS.
 */
export type AssetKind = "image" | "email";

export interface IAsset {
  _id: string;
  /** The run owner. Access control resolves against this. */
  userId: string;
  kind: AssetKind;
  contentType: string;
  data: Buffer;
  bytes: number;
  /** What was asked for, when a model produced this. */
  prompt?: string;
  /** Which model produced it, when one did. */
  model?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<IAsset>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true, index: true },
    kind: { type: String, required: true, enum: ["image", "email"] },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    bytes: { type: Number, required: true },
    prompt: { type: String },
    model: { type: String },
  },
  { timestamps: true, _id: false }
);

export const Asset: Model<IAsset> =
  mongoose.models.Asset || mongoose.model<IAsset>("Asset", AssetSchema);
