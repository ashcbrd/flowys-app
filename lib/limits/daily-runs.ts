import { connectToDatabase } from "@/lib/db";
import { checkRateLimit } from "@/lib/db/models/RateLimit";

/**
 * A hard ceiling on how many workflow runs one account can start in a day.
 *
 * Credits are switched off on this deployment (`UNLIMITED_CREDITS`), which
 * leaves nothing between a single account and an unbounded provider bill: one
 * scheduled workflow left on a short interval, or one webhook that fires in a
 * loop, spends real money for as long as nobody is watching. This cap is that
 * missing floor, and it is deliberately independent of credits so turning
 * metering back on does not quietly remove it.
 *
 * It counts runs rather than credits on purpose. A run is the unit a person
 * recognises, so the message when they hit it needs no explaining.
 */
export const MAX_RUNS_PER_DAY = 10;

/**
 * The day boundary is UTC.
 *
 * Any fixed zone is arbitrary for an account that could be anywhere; UTC is at
 * least the one every server already agrees on, so the count resets at the same
 * instant everywhere and never shifts twice a year with daylight saving.
 */
export function dailyRunKey(userId: string, now: Date): string {
  return `runs:${now.toISOString().slice(0, 10)}:${userId}`;
}

/** How long the current day still has to run, in whole seconds, never zero. */
export function secondsUntilReset(now: Date): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );

  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

export interface DailyRunAllowance {
  allowed: boolean;
  used: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Count one run against the account's day and say whether it may proceed.
 *
 * Call this once, immediately before a run starts, on every path that can start
 * one: the editor, the streaming editor, the public API, an incoming webhook,
 * the scheduler and a published app. Counting in one place per path is what
 * makes the number mean "runs today" rather than "runs today from the editor".
 *
 * A failure to reach the counter refuses the run. A cap that opens when its
 * store is unreachable protects nothing on exactly the day it is needed, and a
 * store that is unreachable would have failed the run seconds later anyway,
 * since the workflow itself is loaded from the same database.
 */
export async function consumeDailyRun(
  userId: string,
  now: Date = new Date()
): Promise<DailyRunAllowance> {
  const resetAt = new Date(now.getTime() + secondsUntilReset(now) * 1000);

  try {
    await connectToDatabase();

    const result = await checkRateLimit({
      key: dailyRunKey(userId, now),
      limit: MAX_RUNS_PER_DAY,
      windowSeconds: secondsUntilReset(now),
    });

    return {
      allowed: result.allowed,
      used: result.count,
      remaining: result.remaining,
      resetAt: result.resetAt ?? resetAt,
    };
  } catch (error) {
    console.error("Daily run cap could not be read, refusing the run:", error);
    return { allowed: false, used: MAX_RUNS_PER_DAY, remaining: 0, resetAt };
  }
}

/** The plain-language refusal. No codes, no jargon, says when it lifts. */
export function dailyLimitMessage(resetAt: Date): string {
  const time = resetAt.toISOString().slice(11, 16);
  return `You have used all ${MAX_RUNS_PER_DAY} runs for today. The count starts again at ${time} UTC.`;
}
