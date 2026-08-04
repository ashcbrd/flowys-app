import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";
import type { Role } from "./Membership";

export type AppStatus = "draft" | "published" | "unpublished";
export type AudienceMode = "workspace" | "roles" | "users";

export interface IAppAudience {
  mode: AudienceMode;
  roles?: Role[];
  userIds?: string[];
}

export interface IAppSettings {
  rateLimitPerHour?: number;
  costCapPerRun?: number;
  retentionDays?: number;
}

export interface IAppListing {
  _id: string;
  workspaceId: string;
  workflowId: string;
  ownerUserId: string;
  slug: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  visibleFields: string[];
  audience: IAppAudience;
  currentVersionId?: string;
  status: AppStatus;
  settings: IAppSettings;
  createdAt: Date;
  updatedAt: Date;
}

const AppListingSchema = new Schema<IAppListing>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true, index: true },
    ownerUserId: { type: String, required: true, index: true },
    slug: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    icon: { type: String },
    color: { type: String },
    category: { type: String },
    visibleFields: { type: [String], default: [] },
    audience: {
      mode: { type: String, enum: ["workspace", "roles", "users"], default: "workspace" },
      roles: { type: [String], default: undefined },
      userIds: { type: [String], default: undefined },
    },
    currentVersionId: { type: String },
    status: {
      type: String,
      enum: ["draft", "published", "unpublished"],
      default: "draft",
      index: true,
    },
    settings: {
      rateLimitPerHour: { type: Number },
      costCapPerRun: { type: Number },
      retentionDays: { type: Number },
    },
  },
  { timestamps: true, _id: false }
);

// One slug per workspace.
AppListingSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });

export const AppListing: Model<IAppListing> =
  mongoose.models.AppListing || mongoose.model<IAppListing>("AppListing", AppListingSchema);
