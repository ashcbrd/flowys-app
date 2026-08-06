import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

/**
 * Who did what, in a shared workspace.
 *
 * Exists for one question that has no other answer: "who gave that person
 * access to this document?" Once more than one person can administer a
 * workspace, every change to membership or document visibility is a change
 * somebody else may need to explain later.
 *
 * Deliberately narrow. This records administrative acts, not activity: it is
 * not a feed, and it does not log reads, because a log of every retrieval
 * would be large, uninteresting, and would itself become a privacy question.
 */
export type AuditAction =
  | "member.added"
  | "member.role_changed"
  | "member.removed"
  | "workspace.created"
  | "document.access_changed"
  | "document.deleted";

export interface IAuditLog {
  _id: string;
  workspaceId: string;
  /** Who performed the act. */
  actorId: string;
  action: AuditAction;
  /** The member or document acted upon. */
  targetId?: string;
  /** A short human-readable summary, written at the call site. */
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    targetId: { type: String },
    summary: { type: String, required: true },
  },
  { timestamps: true, _id: false }
);

// The only query this serves: one workspace's history, newest first.
AuditLogSchema.index({ workspaceId: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
