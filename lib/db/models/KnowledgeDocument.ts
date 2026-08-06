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
  /** Set when a worker claims this document, so a crashed claim can be reclaimed. */
  claimedAt?: Date;
  /** How many times processing has been attempted. Bounded, then failed for good. */
  attempts: number;
  /** The raw text to index, held only while the document is pending. */
  pendingText?: string;
  /** Charge indexing to this account when it completes. */
  meteredToUserId?: string;
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
    claimedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    // Cleared the moment indexing succeeds. Keeping the source text forever
    // would double storage for no benefit: the chunks are the searchable copy.
    pendingText: { type: String },
    meteredToUserId: { type: String },
  },
  { timestamps: true, _id: false }
);

// The processor claims the oldest pending document; without this index that
// is a collection scan on every tick.
KnowledgeDocumentSchema.index({ status: 1, claimedAt: 1 });

export const KnowledgeDocument: Model<IKnowledgeDocument> =
  mongoose.models.KnowledgeDocument ||
  mongoose.model<IKnowledgeDocument>("KnowledgeDocument", KnowledgeDocumentSchema);
