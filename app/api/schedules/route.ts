import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  connectToDatabase,
  Schedule,
  Workflow,
  frequencyToCron,
  getNextRunTime,
} from "@/lib/db";
import { startScheduleJob, stopScheduleJob } from "@/lib/services/scheduler";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");
    const enabled = searchParams.get("enabled");

    const query: Record<string, unknown> = {};
    if (workflowId) query.workflowId = workflowId;
    if (enabled !== null) query.enabled = enabled === "true";

    const schedules = await Schedule.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Transform for API response
    const response = schedules.map((schedule) => ({
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
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const {
      workflowId,
      name,
      description,
      frequency,
      cronExpression: customCron,
      timezone = "UTC",
      input = {},
      enabled = true,
      hour,
      minute,
      dayOfWeek,
      dayOfMonth,
    } = body;

    // Validate required fields
    if (!workflowId) {
      return NextResponse.json(
        { error: "workflowId is required" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (!frequency) {
      return NextResponse.json(
        { error: "frequency is required" },
        { status: 400 }
      );
    }

    // Verify workflow exists
    const workflow = await Workflow.findById(workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    // Generate cron expression
    let cronExpression: string;
    if (frequency === "custom" && customCron) {
      cronExpression = customCron;
    } else {
      cronExpression = frequencyToCron(frequency, {
        hour: hour ?? 0,
        minute: minute ?? 0,
        dayOfWeek: dayOfWeek ?? 0,
        dayOfMonth: dayOfMonth ?? 1,
      });
    }

    // Calculate next run time
    const nextRunAt = getNextRunTime(cronExpression, timezone);

    // Create schedule
    const scheduleId = uuid();
    const schedule = await Schedule.create({
      _id: scheduleId,
      workflowId,
      name,
      description,
      frequency,
      cronExpression,
      timezone,
      input,
      enabled,
      nextRunAt,
    });

    // Start the cron job if enabled
    if (enabled) {
      await startScheduleJob(scheduleId, cronExpression);
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
      nextRunAt: schedule.nextRunAt?.toISOString(),
      totalRuns: schedule.totalRuns,
      successfulRuns: schedule.successfulRuns,
      failedRuns: schedule.failedRuns,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 }
    );
  }
}
