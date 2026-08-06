import { connectToDatabase } from "@/lib/db";
import { AuditLog, type AuditAction, type IAuditLog } from "@/lib/db/models/AuditLog";

/**
 * Record an administrative act.
 *
 * Never throws. An audit write that fails must not undo the thing it was
 * recording: refusing to remove a member because the log was unavailable would
 * turn an observability feature into an outage. A missing line is a gap in the
 * record; a failed removal is a security problem left in place.
 */
export async function recordAudit(entry: {
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  targetId?: string;
  summary: string;
}): Promise<void> {
  try {
    await connectToDatabase();
    await AuditLog.create(entry);
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}

/** One workspace's history, newest first. */
export async function listAudit(workspaceId: string, limit = 100): Promise<IAuditLog[]> {
  await connectToDatabase();
  return AuditLog.find({ workspaceId }).sort({ createdAt: -1 }).limit(limit).lean();
}
