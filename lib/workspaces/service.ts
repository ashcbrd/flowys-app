import { connectToDatabase } from "@/lib/db";
import { Workspace } from "@/lib/db/models/Workspace";
import { Membership, type IMembership, type Role } from "@/lib/db/models/Membership";

/**
 * The id of the user's personal workspace, creating it (and an owner
 * membership) on first call. Idempotent — safe to call on every sign-in.
 */
export async function getOrCreatePersonalWorkspace(userId: string): Promise<string> {
  await connectToDatabase();

  const existing = await Workspace.findOne({ ownerUserId: userId, personal: true });
  if (existing) return existing._id;

  const workspace = await Workspace.create({
    name: "Personal",
    ownerUserId: userId,
    personal: true,
  });
  await Membership.create({ workspaceId: workspace._id, userId, role: "owner" });
  return workspace._id;
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
