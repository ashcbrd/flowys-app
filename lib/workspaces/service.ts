import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/lib/db/models/Workspace";
import { Membership, type IMembership, type Role } from "@/lib/db/models/Membership";

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * The id of the user's personal workspace, creating it (and an owner
 * membership) on first call. Idempotent and race-safe — safe to call
 * concurrently (e.g. two simultaneous sign-ins for the same user) as well as
 * repeatedly.
 *
 * Relies on the partial unique index on Workspace { ownerUserId, personal:
 * true } (see lib/db/models/Workspace.ts) so that only one caller ever wins
 * the insert; the loser re-queries for the winner's workspace instead of
 * erroring.
 */
export async function getOrCreatePersonalWorkspace(userId: string): Promise<string> {
  await connectToDatabase();

  let workspaceId: string;
  try {
    const workspace = await Workspace.findOneAndUpdate(
      { ownerUserId: userId, personal: true },
      { $setOnInsert: { name: "Personal", ownerUserId: userId, personal: true } },
      { upsert: true, new: true }
    );
    workspaceId = workspace!._id;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // Lost a concurrent upsert race against the unique index — another
    // call already created the workspace; use that one.
    const existing = await Workspace.findOne({ ownerUserId: userId, personal: true });
    if (!existing) throw err;
    workspaceId = existing._id;
  }

  // Idempotent upsert: the unique index on Membership { workspaceId, userId }
  // (see lib/db/models/Membership.ts) means a re-run or a concurrent call
  // never creates a second membership.
  try {
    await Membership.updateOne(
      { workspaceId, userId },
      { $setOnInsert: { role: "owner" } },
      { upsert: true }
    );
  } catch (err) {
    // Lost a concurrent upsert race against the membership unique index —
    // another call already created it. That's success, not a failure: the
    // membership this call wanted to ensure exists, does.
    if (!isDuplicateKeyError(err)) throw err;
  }

  return workspaceId;
}

export async function getUserMemberships(userId: string): Promise<IMembership[]> {
  await connectToDatabase();
  return Membership.find({ userId }).lean();
}

export async function getWorkspaceRole(
  workspaceId: string,
  userId: string
): Promise<Role | null> {
  await connectToDatabase();
  const membership = await Membership.findOne({ workspaceId, userId }).lean();
  return membership?.role ?? null;
}
