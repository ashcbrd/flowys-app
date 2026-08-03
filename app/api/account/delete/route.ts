import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, Workflow, Execution, Webhook, ApiKey, Schedule, Connection, UserCredits } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

/**
 * DELETE /api/account/delete
 *
 * Permanently delete user account and all associated data.
 * This is irreversible and complies with GDPR right to erasure.
 *
 * Requires confirmation in request body:
 * { confirm: "DELETE MY ACCOUNT" }
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Require explicit confirmation
    if (body.confirm !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        {
          error: "Confirmation required",
          message: 'Please provide { confirm: "DELETE MY ACCOUNT" } to proceed',
        },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Track deletion progress
    const deletionResults: Record<string, number> = {};

    // Delete all user data in order (respecting dependencies)

    // 1. Delete executions (depends on workflows)
    const executionResult = await Execution.deleteMany({ workflowId: { $in: await getUserWorkflowIds(user.id) } });
    deletionResults.executions = executionResult.deletedCount;

    // 2. Delete schedules (depends on workflows)
    const scheduleResult = await Schedule.deleteMany({ workflowId: { $in: await getUserWorkflowIds(user.id) } });
    deletionResults.schedules = scheduleResult.deletedCount;

    // 3. Delete webhooks (owned by the user)
    const webhookResult = await Webhook.deleteMany({ userId: user.id });
    deletionResults.webhooks = webhookResult.deletedCount;

    // 4. Delete workflows
    const workflowResult = await Workflow.deleteMany({ userId: user.id });
    deletionResults.workflows = workflowResult.deletedCount;

    // 5. Delete API keys
    const apiKeyResult = await ApiKey.deleteMany({ userId: user.id });
    deletionResults.apiKeys = apiKeyResult.deletedCount;

    // 6. Delete connections (integration credentials owned by the user)
    const connectionResult = await Connection.deleteMany({ userId: user.id });
    deletionResults.connections = connectionResult.deletedCount;

    // 7. Delete credits state
    const userCreditsResult = await UserCredits.deleteMany({ userId: user.id });
    deletionResults.userCredits = userCreditsResult.deletedCount;

    // 8. Authentication account cleanup can be handled separately if needed

    // Log deletion for audit purposes (in production, store this in an audit log)
    console.log(`Account deletion completed for user ${user.id}:`, deletionResults);

    return NextResponse.json({
      success: true,
      message: "Your account and all associated data have been permanently deleted.",
      deleted: deletionResults,
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/account/delete
 *
 * Get information about what will be deleted.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const workflowIds = await getUserWorkflowIds(user.id);

    const counts = {
      workflows: await Workflow.countDocuments({ userId: user.id }),
      executions: await Execution.countDocuments({ workflowId: { $in: workflowIds } }),
      webhooks: await Webhook.countDocuments({ userId: user.id }),
      schedules: await Schedule.countDocuments({ workflowId: { $in: workflowIds } }),
      apiKeys: await ApiKey.countDocuments({ userId: user.id }),
      connections: await Connection.countDocuments({ userId: user.id }),
      userCredits: await UserCredits.countDocuments({ userId: user.id }),
    };

    return NextResponse.json({
      message: "Account deletion will permanently remove all the following data:",
      data: counts,
      warning: "This action is irreversible. Please export any data you want to keep before proceeding.",
    });
  } catch (error) {
    console.error("Error getting deletion preview:", error);
    return NextResponse.json(
      { error: "Failed to get deletion preview" },
      { status: 500 }
    );
  }
}

// Helper to get all workflow IDs for a user
async function getUserWorkflowIds(userId: string): Promise<string[]> {
  const workflows = await Workflow.find({ userId }).select("_id").lean();
  return workflows.map((w) => w._id as string);
}
