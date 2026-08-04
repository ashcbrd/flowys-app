import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IAppRun {
  _id: string;
  appListingId: string;
  appVersionId?: string;
  workspaceId: string;
  runByUserId: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  logs?: unknown[];
  error?: string;
  cost?: number;
  durationMs?: number;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AppRunSchema = new Schema<IAppRun>(
  {
    _id: { type: String, default: () => uuid() },
    appListingId: { type: String, required: true, index: true },
    appVersionId: { type: String },
    workspaceId: { type: String, required: true, index: true },
    runByUserId: { type: String, required: true, index: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
      index: true,
    },
    logs: { type: Schema.Types.Mixed },
    error: { type: String },
    cost: { type: Number },
    durationMs: { type: Number },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true, _id: false }
);

export const AppRun: Model<IAppRun> =
  mongoose.models.AppRun || mongoose.model<IAppRun>("AppRun", AppRunSchema);
