import type { Role } from "@/lib/db/models/Membership";
import type { IDocumentAcl } from "@/lib/db/models/KnowledgeDocument";

export interface DocRef {
  _id: string;
  acl: IDocumentAcl;
}

export interface AccessContext {
  userId: string;
  role: Role;
}

/**
 * Whether a single document is visible to a user. Workspace-mode documents are
 * visible to every member; restricted documents only to an allowed user id or
 * an allowed role. No implicit owner/admin bypass — that is granted explicitly
 * via allowedRoles when desired.
 */
export function userCanSeeDocument(doc: DocRef, ctx: AccessContext): boolean {
  if (doc.acl.mode === "workspace") return true;
  if (doc.acl.allowedUserIds?.includes(ctx.userId)) return true;
  if (doc.acl.allowedRoles?.includes(ctx.role)) return true;
  return false;
}

/** The ids of every document in `docs` this user may see. */
export function resolveAllowedDocumentIds(docs: DocRef[], ctx: AccessContext): string[] {
  return docs.filter((doc) => userCanSeeDocument(doc, ctx)).map((doc) => doc._id);
}
