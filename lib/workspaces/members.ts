/**
 * Who is in a workspace, and what they are allowed to do to that list.
 *
 * The role model was built with four roles and then only ever wrote one, so
 * every access rule downstream was theoretically enforced and practically
 * untested. This is the layer that makes the other three roles reachable.
 *
 * The rules are deliberately explicit rather than a numeric rank, because
 * "admin cannot remove an owner" and "nobody can remove the last owner" are
 * not expressible as a comparison and are exactly the cases that get a
 * workspace locked out of itself.
 */
import { connectToDatabase, User } from "@/lib/db";
import { Membership, type Role } from "@/lib/db/models/Membership";
import { Workspace } from "@/lib/db/models/Workspace";

export const ASSIGNABLE_ROLES: Role[] = ["admin", "member", "viewer"];

/** Roles allowed to change the member list at all. */
const CAN_MANAGE: Role[] = ["owner", "admin"];

export interface MemberRow {
  userId: string;
  email: string;
  name?: string;
  role: Role;
  joinedAt: Date;
}

export class MemberError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function requireManager(workspaceId: string, userId: string): Promise<Role> {
  await connectToDatabase();
  const membership = await Membership.findOne({ workspaceId, userId }).lean();
  if (!membership) throw new MemberError("You are not a member of this workspace", 403);
  if (!CAN_MANAGE.includes(membership.role)) {
    throw new MemberError("Only owners and admins can change who is in a workspace", 403);
  }
  return membership.role;
}

/** Everyone in the workspace, with the identity details the UI needs. */
export async function listMembers(workspaceId: string): Promise<MemberRow[]> {
  await connectToDatabase();

  const memberships = await Membership.find({ workspaceId }).sort({ createdAt: 1 }).lean();
  if (memberships.length === 0) return [];

  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select({ _id: 1, email: 1, name: 1 })
    .lean();
  const byId = new Map(users.map((u) => [u._id, u]));

  return memberships.map((m) => ({
    userId: m.userId,
    email: byId.get(m.userId)?.email ?? "(deleted account)",
    name: byId.get(m.userId)?.name,
    role: m.role,
    joinedAt: m.createdAt,
  }));
}

/**
 * Add someone by email.
 *
 * Deliberately requires an existing account rather than sending an invitation
 * to a stranger: an invite flow needs email delivery, token expiry and an
 * acceptance page, and shipping half of it would mean pending rows nobody can
 * ever redeem. The error says exactly that, so the person reading it knows the
 * next step is "get them to sign up" rather than "try again".
 */
export async function addMember(
  workspaceId: string,
  actorId: string,
  email: string,
  role: Role
): Promise<MemberRow> {
  await requireManager(workspaceId, actorId);

  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new MemberError(
      "Pick admin, member or viewer. Ownership is transferred, not assigned.",
      400
    );
  }

  await connectToDatabase();
  const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
  if (!user) {
    throw new MemberError(
      `Nobody with the address ${email} has a Flowys account yet. Ask them to sign up first, then add them.`,
      404
    );
  }

  const existing = await Membership.findOne({ workspaceId, userId: user._id }).lean();
  if (existing) {
    throw new MemberError(`${email} is already in this workspace`, 409);
  }

  await Membership.create({ workspaceId, userId: user._id, role });

  return { userId: user._id, email: user.email, name: user.name, role, joinedAt: new Date() };
}

export async function changeRole(
  workspaceId: string,
  actorId: string,
  targetUserId: string,
  role: Role
): Promise<void> {
  const actorRole = await requireManager(workspaceId, actorId);

  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new MemberError("Pick admin, member or viewer", 400);
  }

  const target = await Membership.findOne({ workspaceId, userId: targetUserId }).lean();
  if (!target) throw new MemberError("That person is not in this workspace", 404);

  // An admin demoting an owner is the shape of a privilege escalation, so it
  // is refused even though an admin may otherwise change roles.
  if (target.role === "owner" && actorRole !== "owner") {
    throw new MemberError("Only an owner can change an owner's role", 403);
  }
  if (target.role === "owner") {
    await assertNotLastOwner(workspaceId, targetUserId);
  }

  await Membership.updateOne({ workspaceId, userId: targetUserId }, { role });
}

export async function removeMember(
  workspaceId: string,
  actorId: string,
  targetUserId: string
): Promise<void> {
  const actorRole = await requireManager(workspaceId, actorId);

  const target = await Membership.findOne({ workspaceId, userId: targetUserId }).lean();
  if (!target) throw new MemberError("That person is not in this workspace", 404);

  if (target.role === "owner") {
    if (actorRole !== "owner") {
      throw new MemberError("Only an owner can remove an owner", 403);
    }
    await assertNotLastOwner(workspaceId, targetUserId);
  }

  await Membership.deleteOne({ workspaceId, userId: targetUserId });
}

/**
 * A workspace with no owner cannot be administered by anyone, and there is no
 * recovery path short of a database edit. Both the demote and the remove path
 * come through here.
 */
async function assertNotLastOwner(workspaceId: string, targetUserId: string): Promise<void> {
  const owners = await Membership.countDocuments({ workspaceId, role: "owner" });
  if (owners <= 1) {
    throw new MemberError(
      "This is the last owner. Make someone else an owner first, or the workspace would be left with nobody who can administer it.",
      409
    );
  }
  // Referenced so the signature stays honest about what it is checking.
  void targetUserId;
}

/**
 * A shared workspace the user owns, created on demand.
 *
 * Separate from the personal workspace, which is `personal: true` and is not
 * meant to gain members: sharing the workspace that holds someone's private
 * documents by adding a colleague to it is a mistake the model should not
 * allow in one click.
 */
export async function createSharedWorkspace(userId: string, name: string): Promise<string> {
  await connectToDatabase();

  const trimmed = name.trim();
  if (!trimmed) throw new MemberError("Give the workspace a name", 400);

  const workspace = await Workspace.create({
    name: trimmed,
    ownerUserId: userId,
    personal: false,
  });
  await Membership.create({ workspaceId: workspace._id, userId, role: "owner" });
  return workspace._id;
}

/** Every workspace the user belongs to, personal first. */
export async function listUserWorkspaces(
  userId: string
): Promise<{ id: string; name: string; personal: boolean; role: Role }[]> {
  await connectToDatabase();

  const memberships = await Membership.find({ userId }).lean();
  if (memberships.length === 0) return [];

  const workspaces = await Workspace.find({ _id: { $in: memberships.map((m) => m.workspaceId) } }).lean();
  const roleFor = new Map(memberships.map((m) => [m.workspaceId, m.role]));

  return workspaces
    .map((w) => ({
      id: w._id,
      name: w.name,
      personal: !!w.personal,
      role: roleFor.get(w._id)!,
    }))
    .sort((a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name));
}
