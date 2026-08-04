import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IAppVersion {
  _id: string;
  appListingId: string;
  workspaceId: string;
  version: number;
  snapshot: { nodes: unknown[]; edges: unknown[] };
  publishedByUserId: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppVersionSchema = new Schema<IAppVersion>(
  {
    _id: { type: String, default: () => uuid() },
    appListingId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    publishedByUserId: { type: String, required: true },
    note: { type: String },
  },
  { timestamps: true, _id: false }
);

// Versions are numbered per app.
AppVersionSchema.index({ appListingId: 1, version: 1 }, { unique: true });

export const AppVersion: Model<IAppVersion> =
  mongoose.models.AppVersion || mongoose.model<IAppVersion>("AppVersion", AppVersionSchema);
