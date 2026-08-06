import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IKnowledgeBase {
  _id: string;
  workspaceId: string;
  name: string;
  description?: string;
  defaultVisibility: "workspace" | "restricted";
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeBaseSchema = new Schema<IKnowledgeBase>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    defaultVisibility: {
      type: String,
      enum: ["workspace", "restricted"],
      default: "workspace",
    },
  },
  { timestamps: true, _id: false }
);

export const KnowledgeBase: Model<IKnowledgeBase> =
  mongoose.models.KnowledgeBase ||
  mongoose.model<IKnowledgeBase>("KnowledgeBase", KnowledgeBaseSchema);
