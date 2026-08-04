import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IWorkspace {
  _id: string;
  name: string;
  ownerUserId: string;
  personal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: String, required: true },
    personal: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false }
);

// Guarantees exactly one personal workspace per owner, even under concurrent
// sign-ins — the app-layer upsert in lib/workspaces/service.ts relies on this
// index to make getOrCreatePersonalWorkspace race-safe.
WorkspaceSchema.index(
  { ownerUserId: 1 },
  { unique: true, partialFilterExpression: { personal: true } }
);

export const Workspace: Model<IWorkspace> =
  mongoose.models.Workspace || mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);
