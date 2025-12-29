import cron, { ScheduledTask } from "node-cron";
import { connectToDatabase, Schedule, Workflow, Execution, getNextRunTime } from "@/lib/db";
import { createExecutor } from "@/lib/engine";
import { v4 as uuid } from "uuid";

// Store active cron jobs
const activeJobs: Map<string, ScheduledTask> = new Map();

// Flag to track initialization
let isInitialized = false;

/**
 * Initialize the scheduler service
 * This should be called once when the server starts
 */
export async function initializeScheduler(): Promise<void> {
  if (isInitialized) return;

  try {
    await connectToDatabase();
    const schedules = await Schedule.find({ enabled: true }).lean();

    for (const schedule of schedules) {
      await startScheduleJob(schedule._id, schedule.cronExpression);
    }

    isInitialized = true;
    console.log(`[Scheduler] Initialized with ${schedules.length} active schedules`);
  } catch (error) {
    console.error("[Scheduler] Failed to initialize:", error);
  }
}

/**
 * Start a cron job for a schedule
 */
export async function startScheduleJob(scheduleId: string, cronExpression: string): Promise<boolean> {
  try {
    // Stop existing job if any
    stopScheduleJob(scheduleId);

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression for schedule ${scheduleId}: ${cronExpression}`);
      return false;
    }

    // Create and start the cron job
    const job = cron.schedule(cronExpression, async () => {
      await executeScheduledWorkflow(scheduleId);
    });

    activeJobs.set(scheduleId, job);

    // Update next run time
    const nextRunAt = getNextRunTime(cronExpression);
    await Schedule.findByIdAndUpdate(scheduleId, { nextRunAt });

    console.log(`[Scheduler] Started job for schedule ${scheduleId}`);
    return true;
  } catch (error) {
    console.error(`[Scheduler] Failed to start job for schedule ${scheduleId}:`, error);
    return false;
  }
}

/**
 * Stop a cron job for a schedule
 */
export function stopScheduleJob(scheduleId: string): void {
  const job = activeJobs.get(scheduleId);
  if (job) {
    job.stop();
    activeJobs.delete(scheduleId);
    console.log(`[Scheduler] Stopped job for schedule ${scheduleId}`);
  }
}

/**
 * Execute a scheduled workflow
 */
export async function executeScheduledWorkflow(scheduleId: string): Promise<{
  success: boolean;
  executionId?: string;
  error?: string;
}> {
  try {
    await connectToDatabase();

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    if (!schedule.enabled) {
      return { success: false, error: "Schedule is disabled" };
    }

    const workflow = await Workflow.findById(schedule.workflowId).lean();
    if (!workflow) {
      // Update schedule with error
      await Schedule.findByIdAndUpdate(scheduleId, {
        lastRunAt: new Date(),
        lastRunStatus: "failed",
        lastRunError: "Workflow not found",
        $inc: { totalRuns: 1, failedRuns: 1 },
      });
      return { success: false, error: "Workflow not found" };
    }

    // Create execution record
    const executionId = uuid();
    const now = new Date();

    await Execution.create({
      _id: executionId,
      workflowId: workflow._id,
      status: "running",
      input: schedule.input || {},
      startedAt: now,
    });

    // Execute the workflow
    const executor = createExecutor(workflow.nodes, workflow.edges);
    const result = await executor.execute(schedule.input || {});

    // Update execution record
    await Execution.findByIdAndUpdate(executionId, {
      status: result.success ? "completed" : "failed",
      output: result.output,
      logs: result.logs,
      error: result.error,
      completedAt: new Date(),
    });

    // Update schedule with run info
    const nextRunAt = getNextRunTime(schedule.cronExpression, schedule.timezone);
    await Schedule.findByIdAndUpdate(scheduleId, {
      lastRunAt: now,
      nextRunAt,
      lastRunStatus: result.success ? "success" : "failed",
      lastRunError: result.error || undefined,
      lastExecutionId: executionId,
      $inc: {
        totalRuns: 1,
        successfulRuns: result.success ? 1 : 0,
        failedRuns: result.success ? 0 : 1,
      },
    });

    console.log(`[Scheduler] Executed workflow ${workflow._id} for schedule ${scheduleId}: ${result.success ? "success" : "failed"}`);

    return {
      success: result.success,
      executionId,
      error: result.error,
    };
  } catch (error) {
    console.error(`[Scheduler] Error executing schedule ${scheduleId}:`, error);

    // Update schedule with error
    await Schedule.findByIdAndUpdate(scheduleId, {
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      lastRunError: error instanceof Error ? error.message : "Unknown error",
      $inc: { totalRuns: 1, failedRuns: 1 },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process all due schedules
 * This can be called by an external cron service for serverless environments
 */
export async function processDueSchedules(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: Array<{ scheduleId: string; success: boolean; error?: string }>;
}> {
  try {
    await connectToDatabase();

    const now = new Date();
    const dueSchedules = await Schedule.find({
      enabled: true,
      $or: [
        { nextRunAt: { $lte: now } },
        { nextRunAt: { $exists: false } },
      ],
    }).lean();

    const results: Array<{ scheduleId: string; success: boolean; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const schedule of dueSchedules) {
      const result = await executeScheduledWorkflow(schedule._id);
      results.push({
        scheduleId: schedule._id,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return {
      processed: dueSchedules.length,
      successful,
      failed,
      results,
    };
  } catch (error) {
    console.error("[Scheduler] Error processing due schedules:", error);
    throw error;
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  initialized: boolean;
  activeJobs: number;
  jobIds: string[];
} {
  return {
    initialized: isInitialized,
    activeJobs: activeJobs.size,
    jobIds: Array.from(activeJobs.keys()),
  };
}
