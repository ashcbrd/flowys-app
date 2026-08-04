import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export type Role = "owner" | "admin" | "member" | "viewer";

export interface IMembership {
  _id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      required: true,
    },
  },
  { timestamps: true, _id: false }
);

// A user has exactly one role per workspace.
MembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const Membership: Model<IMembership> =
  mongoose.models.Membership || mongoose.model<IMembership>("Membership", MembershipSchema);
