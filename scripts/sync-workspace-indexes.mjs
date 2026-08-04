// One-time migration: apply the partial unique index on Workspace
// { ownerUserId, personal: true } to an existing collection.
//
// Why this exists: mongoose's autoIndex only creates indexes that don't
// already exist BY NAME. The Workspace model used to declare a plain
// `ownerUserId: { index: true }`, which built an index also named
// "ownerUserId_1". When the schema changed to a partial unique index with
// the same auto-generated name, autoIndex silently no-op'd on any
// environment that had already run the old schema — the old, non-unique
// index stayed in place and the race that index exists to close (two
// concurrent sign-ins each creating a personal workspace) was NOT actually
// closed there. Workspace.syncIndexes() drops indexes that don't match the
// current schema and rebuilds them, which fixes this.
//
// MUST BE RUN ONCE PER ENVIRONMENT when deploying this branch (shared
// dev/CI Atlas, staging, production) — any environment that already has a
// `workspaces` collection from before this change needs it. A brand-new
// collection does not strictly need it (autoIndex builds the index
// correctly there), but running it is harmless and idempotent either way.
//
//   node scripts/sync-workspace-indexes.mjs
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

// Defined inline, deliberately, with EXACTLY the indexes the real
// lib/db/models/Workspace.ts model declares — nothing extra. Kept in sync
// by hand; this script is a one-off migration, not a long-lived import of
// the app's model.
const WorkspaceSchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: String, required: true },
    personal: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false }
);
WorkspaceSchema.index(
  { ownerUserId: 1 },
  { unique: true, partialFilterExpression: { personal: true } }
);
const Workspace = mongoose.models.Workspace || mongoose.model("Workspace", WorkspaceSchema);

await mongoose.connect(uri, { bufferCommands: false });

console.log("Indexes before sync:");
console.log(JSON.stringify(await Workspace.collection.indexes(), null, 2));

const result = await Workspace.syncIndexes();
console.log("syncIndexes() dropped/rebuilt:", result.length ? result : "(nothing to change)");

console.log("Indexes after sync:");
console.log(JSON.stringify(await Workspace.collection.indexes(), null, 2));

await mongoose.disconnect();
console.log("Done.");
