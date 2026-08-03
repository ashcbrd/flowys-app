// One-time seed: promote the previously-hardcoded single account
// (user@flowys.io / id "flowys-user") into a real User row, so every workflow,
// credit balance and connection already stored under userId "flowys-user"
// remains owned after the switch to database-backed accounts.
//
// Idempotent: re-running only ensures the row exists; it never overwrites a
// password the owner may have since changed.
//
//   node scripts/seed-legacy-account.mjs
import dotenv from "dotenv";
import mongoose from "mongoose";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

dotenv.config();

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

const LEGACY = {
  _id: "flowys-user",
  email: "user@flowys.io",
  name: "Flowys User",
  password: "@FLOWYS2025",
};

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    _id: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true, _id: false }
);
const User = mongoose.models.User || mongoose.model("User", UserSchema);

await mongoose.connect(uri, { bufferCommands: false });

// Report which ids currently own data, so we can confirm the legacy id is real.
const owners = await mongoose.connection.db
  .collection("workflows")
  .distinct("userId");
console.log("userIds owning workflows:", owners.length ? owners : "(none)");

const existing = await User.findById(LEGACY._id);
if (existing) {
  console.log(`Legacy user already present (${existing.email}); leaving as-is.`);
} else {
  const passwordHash = await hashPassword(LEGACY.password);
  await User.create({
    _id: LEGACY._id,
    email: LEGACY.email,
    name: LEGACY.name,
    passwordHash,
  });
  console.log(`Seeded legacy user ${LEGACY.email} with id "${LEGACY._id}".`);
}

await mongoose.disconnect();
console.log("Done.");
