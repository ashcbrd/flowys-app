import type { Role } from "@/lib/db/models/Membership";
import type { IAppAudience } from "@/lib/db/models/AppListing";

export interface AppAccessContext {
  userId: string;
  role: Role | null; // null means the user is not a member of the app's workspace
}

/**
 * Whether a user may open/run an app, given the app's audience and the user's
 * role in the app's workspace. Default-deny:
 * - a non-member (role null) is denied for every audience;
 * - "workspace" is visible to any member;
 * - "roles" requires the user's role to be listed;
 * - "users" requires the user's id to be listed.
 * Callers must pass the user's role IN THE APP'S WORKSPACE (null if not a member).
 */
export function userCanAccessApp(audience: IAppAudience, ctx: AppAccessContext): boolean {
  if (!ctx.role) return false;
  switch (audience.mode) {
    case "workspace":
      return true;
    case "roles":
      return audience.roles?.includes(ctx.role) ?? false;
    case "users":
      return audience.userIds?.includes(ctx.userId) ?? false;
    default:
      return false;
  }
}
