import mongoose, { Schema, Document, Model } from "mongoose";

export type ScheduleFrequency =
  | "every_minute"
  | "every_5_minutes"
  | "every_15_minutes"
  | "every_30_minutes"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export interface ISchedule {
  _id: string;
  workflowId: string;
  name: string;
  description?: string;

  // Schedule configuration
  frequency: ScheduleFrequency;
  cronExpression: string;
  timezone: string;

  // Execution settings
  input?: Record<string, unknown>;
  enabled: boolean;

  // Run tracking
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastRunStatus?: "success" | "failed";
  lastRunError?: string;
  lastExecutionId?: string;

  // Statistics
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;

  createdAt: Date;
  updatedAt: Date;
}

const ScheduleSchema = new Schema<ISchedule>(
  {
    _id: { type: String, required: true },
    workflowId: {
      type: String,
      ref: "Workflow",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    description: { type: String },

    // Schedule configuration
    frequency: {
      type: String,
      enum: [
        "every_minute",
        "every_5_minutes",
        "every_15_minutes",
        "every_30_minutes",
        "hourly",
        "daily",
        "weekly",
        "monthly",
        "custom",
      ],
      required: true,
    },
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: "UTC" },

    // Execution settings
    input: { type: Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },

    // Run tracking
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    lastRunStatus: {
      type: String,
      enum: ["success", "failed"],
    },
    lastRunError: { type: String },
    lastExecutionId: { type: String },

    // Statistics
    totalRuns: { type: Number, default: 0 },
    successfulRuns: { type: Number, default: 0 },
    failedRuns: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for finding enabled schedules
ScheduleSchema.index({ enabled: 1, nextRunAt: 1 });

// Helper to convert frequency to cron expression
export function frequencyToCron(frequency: ScheduleFrequency, options?: { hour?: number; minute?: number; dayOfWeek?: number; dayOfMonth?: number }): string {
  const hour = options?.hour ?? 0;
  const minute = options?.minute ?? 0;
  const dayOfWeek = options?.dayOfWeek ?? 0; // 0 = Sunday
  const dayOfMonth = options?.dayOfMonth ?? 1;

  switch (frequency) {
    case "every_minute":
      return "* * * * *";
    case "every_5_minutes":
      return "*/5 * * * *";
    case "every_15_minutes":
      return "*/15 * * * *";
    case "every_30_minutes":
      return "*/30 * * * *";
    case "hourly":
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth} * *`;
    default:
      return "0 0 * * *"; // Default to daily at midnight
  }
}

// Helper to get next run time from cron expression
export function getNextRunTime(cronExpression: string, timezone: string = "UTC"): Date {
  // Simple cron parser for next run time calculation
  const parts = cronExpression.split(" ");
  if (parts.length !== 5) return new Date();

  const now = new Date();
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // For simple cases, calculate next run
  const next = new Date(now);

  if (minute === "*" && hour === "*") {
    // Runs every minute or every N minutes
    if (minute.includes("/")) {
      const interval = parseInt(minute.split("/")[1]);
      const currentMinute = now.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;
      next.setMinutes(nextMinute);
      next.setSeconds(0);
      next.setMilliseconds(0);
      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1);
        next.setMinutes(nextMinute - 60);
      }
    } else {
      next.setMinutes(now.getMinutes() + 1);
      next.setSeconds(0);
      next.setMilliseconds(0);
    }
  } else if (hour === "*") {
    // Runs every hour at specific minute
    const targetMinute = parseInt(minute);
    next.setMinutes(targetMinute);
    next.setSeconds(0);
    next.setMilliseconds(0);
    if (now.getMinutes() >= targetMinute) {
      next.setHours(next.getHours() + 1);
    }
  } else if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    // Daily
    const targetHour = parseInt(hour);
    const targetMinute = parseInt(minute);
    next.setHours(targetHour);
    next.setMinutes(targetMinute);
    next.setSeconds(0);
    next.setMilliseconds(0);
    if (now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMinute)) {
      next.setDate(next.getDate() + 1);
    }
  } else if (dayOfWeek !== "*") {
    // Weekly
    const targetDay = parseInt(dayOfWeek);
    const targetHour = parseInt(hour);
    const targetMinute = parseInt(minute);
    next.setHours(targetHour);
    next.setMinutes(targetMinute);
    next.setSeconds(0);
    next.setMilliseconds(0);
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && (now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMinute)))) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
  } else if (dayOfMonth !== "*") {
    // Monthly
    const targetDayOfMonth = parseInt(dayOfMonth);
    const targetHour = parseInt(hour);
    const targetMinute = parseInt(minute);
    next.setDate(targetDayOfMonth);
    next.setHours(targetHour);
    next.setMinutes(targetMinute);
    next.setSeconds(0);
    next.setMilliseconds(0);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next;
}

export const Schedule: Model<ISchedule> =
  mongoose.models.Schedule || mongoose.model<ISchedule>("Schedule", ScheduleSchema);
