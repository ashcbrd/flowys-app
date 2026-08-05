import { auth } from "./auth";
import { Workflow } from "./db/schemas";

export async function getAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export async function requireAuth() {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function verifyWorkflowOwnership(workflowId: string, userId: string) {
  const workflow = await Workflow.findById(workflowId);
  if (!workflow) {
    return null;
  }
  if (workflow.userId !== userId) {
    return null;
  }
  return workflow;
}

export async function requireWorkflowOwnership(workflowId: string, userId: string) {
  const workflow = await verifyWorkflowOwnership(workflowId, userId);
  if (!workflow) {
    throw new Error("Workflow not found");
  }
  return workflow;
}

/**
 * The ids of every workflow a user owns. Used to scope collections that hang
 * off a workflow (schedules, webhooks, executions) to a single account without
 * those models needing their own userId column.
 */
export async function getUserWorkflowIds(userId: string): Promise<string[]> {
  const workflows = await Workflow.find({ userId }).select("_id").lean();
  return workflows.map((w) => String(w._id));
}

/**
 * True only if the given workflow exists and belongs to this user. A cheap
 * ownership gate for records that reference a workflow by id.
 */
export async function userOwnsWorkflow(
  workflowId: string,
  userId: string
): Promise<boolean> {
  const workflow = await verifyWorkflowOwnership(workflowId, userId);
  return workflow !== null;
}
