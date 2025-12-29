import { NextRequest, NextResponse } from "next/server";
import {
  connectToDatabase,
  Schedule,
  frequencyToCron,
  getNextRunTime,
} from "@/lib/db";
import {
  startScheduleJob,
  stopScheduleJob,
  executeScheduledWorkflow,
} from "@/lib/services/scheduler";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const schedule = await Schedule.findById(id).lean();
    if (!schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: schedule._id,
      workflowId: schedule.workflowId,
      name: schedule.name,
      description: schedule.description,
      frequency: schedule.frequency,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      input: schedule.input,
      enabled: schedule.enabled,
      lastRunAt: schedule.lastRunAt?.toISOString(),
      nextRunAt: schedule.nextRunAt?.toISOString(),
      lastRunStatus: schedule.lastRunStatus,
      lastRunError: schedule.lastRunError,
      lastExecutionId: schedule.lastExecutionId,
      totalRuns: schedule.totalRuns,
      successfulRuns: schedule.successfulRuns,
      failedRuns: schedule.failedRuns,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      name,
      description,
      frequency,
      cronExpression: customCron,
      timezone,
      input,
      enabled,
      hour,
      minute,
      dayOfWeek,
      dayOfMonth,
    } = body;

    // Update fields if provided
    if (name !== undefined) schedule.name = name;
    if (description !== undefined) schedule.description = description;
    if (timezone !== undefined) schedule.timezone = timezone;
    if (input !== undefined) schedule.input = input;

    // Handle frequency/cron updates
    if (frequency !== undefined) {
      schedule.frequency = frequency;
      if (frequency === "custom" && customCron) {
        schedule.cronExpression = customCron;
      } else {
        schedule.cronExpression = frequencyToCron(frequency, {
          hour: hour ?? 0,
          minute: minute ?? 0,
          dayOfWeek: dayOfWeek ?? 0,
          dayOfMonth: dayOfMonth ?? 1,
        });
      }
      schedule.nextRunAt = getNextRunTime(schedule.cronExpression, schedule.timezone);
    }

    // Handle enabled state change
    const wasEnabled = schedule.enabled;
    if (enabled !== undefined) {
      schedule.enabled = enabled;
    }

    await schedule.save();

    // Update cron job based on enabled state
    if (schedule.enabled && (!wasEnabled || frequency !== undefined)) {
      // Start or restart the job
      await startScheduleJob(id, schedule.cronExpression);
    } else if (!schedule.enabled && wasEnabled) {
      // Stop the job
      stopScheduleJob(id);
    }

    return NextResponse.json({
      id: schedule._id,
      workflowId: schedule.workflowId,
      name: schedule.name,
      description: schedule.description,
      frequency: schedule.frequency,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      input: schedule.input,
      enabled: schedule.enabled,
      lastRunAt: schedule.lastRunAt?.toISOString(),
      nextRunAt: schedule.nextRunAt?.toISOString(),
      lastRunStatus: schedule.lastRunStatus,
      lastRunError: schedule.lastRunError,
      lastExecutionId: schedule.lastExecutionId,
      totalRuns: schedule.totalRuns,
      successfulRuns: schedule.successfulRuns,
      failedRuns: schedule.failedRuns,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error updating schedule:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    // Stop the cron job
    stopScheduleJob(id);

    // Delete the schedule
    await Schedule.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}

// POST to trigger a schedule manually
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { id } = await params;

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    // Execute the workflow
    const result = await executeScheduledWorkflow(id);

    if (result.success) {
      return NextResponse.json({
        success: true,
        executionId: result.executionId,
        message: "Schedule triggered successfully",
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        message: "Schedule execution failed",
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Error triggering schedule:", error);
    return NextResponse.json(
      { error: "Failed to trigger schedule" },
      { status: 500 }
    );
  }
}
