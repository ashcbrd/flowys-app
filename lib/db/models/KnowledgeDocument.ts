import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface IDocumentAcl {
  mode: "workspace" | "restricted";
  allowedUserIds?: string[];
  allowedRoles?: string[];
}

export interface IKnowledgeDocument {
  _id: string;
  workspaceId: string;
  knowledgeBaseId: string;
  source: { type: "upload" | "url" | "connector"; ref: string };
  title: string;
  status: DocumentStatus;
  error?: string;
  acl: IDocumentAcl;
  checksum?: string;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeDocumentSchema = new Schema<IKnowledgeDocument>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    knowledgeBaseId: { type: String, required: true, index: true },
    source: {
      type: { type: String, enum: ["upload", "url", "connector"], required: true },
      ref: { type: String, required: true },
    },
    title: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String },
    acl: {
      mode: { type: String, enum: ["workspace", "restricted"], default: "workspace" },
      allowedUserIds: { type: [String], default: undefined },
      allowedRoles: { type: [String], default: undefined },
    },
    checksum: { type: String },
    chunkCount: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
);

export const KnowledgeDocument: Model<IKnowledgeDocument> =
  mongoose.models.KnowledgeDocument ||
  mongoose.model<IKnowledgeDocument>("KnowledgeDocument", KnowledgeDocumentSchema);
