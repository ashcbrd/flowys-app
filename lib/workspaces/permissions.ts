import type { Role } from "@/lib/db/models/Membership";
import type { IDocumentAcl } from "@/lib/db/models/KnowledgeDocument";

export interface DocRef {
  _id: string;
  acl: IDocumentAcl;
}

export interface AccessContext {
  userId: string;
  role: Role | null;
}

/**
 * Whether a single document is visible to a user. Workspace-mode documents are
 * visible to every member; restricted documents only to an allowed user id or
 * an allowed role. No implicit owner/admin bypass — that is granted explicitly
 * via allowedRoles when desired.
 *
 * Preconditions this function relies on and does not itself verify:
 * - `doc` (and any `docs` passed to `resolveAllowedDocumentIds`) is already
 *   scoped to the ONE workspace the user belongs to. The query layer is
 *   responsible for filtering by workspaceId before calling this; `DocRef`
 *   intentionally carries no workspaceId, so this function cannot check it.
 * - `ctx.role` is the user's role IN THAT workspace, as returned by
 *   `getWorkspaceRole`. A `null` role means the user is not a member of the
 *   workspace the docs were scoped to, and is denied everything below —
 *   including workspace-mode documents — by construction, not by caller
 *   discipline.
 */
export function userCanSeeDocument(doc: DocRef, ctx: AccessContext): boolean {
  if (!ctx.role) return false;
  if (doc.acl.mode === "workspace") return true;
  if (doc.acl.allowedUserIds?.includes(ctx.userId)) return true;
  if (doc.acl.allowedRoles?.includes(ctx.role)) return true;
  return false;
}

/** The ids of every document in `docs` this user may see. */
export function resolveAllowedDocumentIds(docs: DocRef[], ctx: AccessContext): string[] {
  return docs.filter((doc) => userCanSeeDocument(doc, ctx)).map((doc) => doc._id);
}
