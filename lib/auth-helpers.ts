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
