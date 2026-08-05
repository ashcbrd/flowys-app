import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IUser {
  _id: string;
  email: string;
  name?: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    // String id (uuid) so a user's id can be embedded directly as the `userId`
    // string that every other collection scopes by. The legacy seeded account
    // keeps its original id ("flowys-user") so pre-existing data stays owned.
    _id: { type: String, default: () => uuid() },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, _id: false }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
