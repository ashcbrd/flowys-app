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
    ownerUserId: { type: String, required: true, index: true },
    personal: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false }
);

export const Workspace: Model<IWorkspace> =
  mongoose.models.Workspace || mongoose.model<IWorkspace>("Workspace", WorkspaceSchema);
