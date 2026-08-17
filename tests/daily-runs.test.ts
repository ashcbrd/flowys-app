import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The daily run cap is the only thing standing between one account and an
 * unbounded provider bill, so it is tested at the seam where it decides:
 * the key it counts against, when that count resets, and what it does when
 * the store it counts in is unreachable.
 */

const checkRateLimit = vi.fn();

vi.mock("@/lib/db/models/RateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/db", () => ({
  connectToDatabase: async () => undefined,
}));

import {
  MAX_RUNS_PER_DAY,
  dailyRunKey,
  secondsUntilReset,
  consumeDailyRun,
  dailyLimitMessage,
} from "@/lib/limits/daily-runs";

beforeEach(() => {
  checkRateLimit.mockReset();
});

describe("the cap itself", () => {
  it("is ten runs a day", () => {
    expect(MAX_RUNS_PER_DAY).toBe(10);
  });
});

describe("dailyRunKey", () => {
  it("counts each account separately", () => {
    const now = new Date("2026-08-17T09:00:00.000Z");
    expect(dailyRunKey("user-a", now)).not.toBe(dailyRunKey("user-b", now));
  });

  it("keeps one key for the whole day, whatever hour a run lands on", () => {
    const morning = new Date("2026-08-17T00:00:01.000Z");
    const evening = new Date("2026-08-17T23:59:59.000Z");
    expect(dailyRunKey("user-a", morning)).toBe(dailyRunKey("user-a", evening));
  });

  it("starts a fresh key the moment the day turns over", () => {
    const before = new Date("2026-08-17T23:59:59.000Z");
    const after = new Date("2026-08-18T00:00:00.000Z");
    expect(dailyRunKey("user-a", before)).not.toBe(dailyRunKey("user-a", after));
  });
});

describe("secondsUntilReset", () => {
  it("never returns zero, so a window is always long enough to hold a count", () => {
    expect(secondsUntilReset(new Date("2026-08-17T23:59:59.999Z"))).toBeGreaterThan(0);
  });

  it("is a full day just after midnight and a sliver just before it", () => {
    expect(secondsUntilReset(new Date("2026-08-17T00:00:00.000Z"))).toBe(86400);
    expect(secondsUntilReset(new Date("2026-08-17T23:00:00.000Z"))).toBe(3600);
  });
});

describe("consumeDailyRun", () => {
  it("allows a run while the account is under the cap", async () => {
    const resetAt = new Date("2026-08-18T00:00:00.000Z");
    checkRateLimit.mockResolvedValue({ allowed: true, count: 3, remaining: 7, resetAt });

    const result = await consumeDailyRun("user-a", new Date("2026-08-17T09:00:00.000Z"));

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(3);
    expect(result.remaining).toBe(7);
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ limit: MAX_RUNS_PER_DAY })
    );
  });

  it("refuses the eleventh run of the day", async () => {
    const resetAt = new Date("2026-08-18T00:00:00.000Z");
    checkRateLimit.mockResolvedValue({ allowed: false, count: 11, remaining: 0, resetAt });

    const result = await consumeDailyRun("user-a", new Date("2026-08-17T09:00:00.000Z"));

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toEqual(resetAt);
  });

  it("refuses the run when the counter cannot be reached, because a cap that fails open is not a cap", async () => {
    checkRateLimit.mockRejectedValue(new Error("mongo is down"));

    const result = await consumeDailyRun("user-a", new Date("2026-08-17T09:00:00.000Z"));

    expect(result.allowed).toBe(false);
  });

  it("counts one run per call, so two triggers on one account share the tally", async () => {
    const resetAt = new Date("2026-08-18T00:00:00.000Z");
    checkRateLimit
      .mockResolvedValueOnce({ allowed: true, count: 1, remaining: 9, resetAt })
      .mockResolvedValueOnce({ allowed: true, count: 2, remaining: 8, resetAt });

    const now = new Date("2026-08-17T09:00:00.000Z");
    await consumeDailyRun("user-a", now);
    const second = await consumeDailyRun("user-a", now);

    expect(second.used).toBe(2);
    expect(checkRateLimit.mock.calls[0][0].key).toBe(checkRateLimit.mock.calls[1][0].key);
  });
});

describe("dailyLimitMessage", () => {
  it("says what happened and when it lifts, in plain words", () => {
    const message = dailyLimitMessage(new Date("2026-08-18T00:00:00.000Z"));
    expect(message).toContain("10");
    expect(message.toLowerCase()).toContain("today");
    expect(message).not.toMatch(/[{}[\]]|JSON|429/);
  });
});
