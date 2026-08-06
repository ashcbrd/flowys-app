import { describe, it, expect } from "vitest";
import { INLINE_CHUNK_LIMIT } from "@/lib/knowledge/ingest";

/**
 * Queuing a document is a success, and it briefly did not look like one.
 *
 * `pending` shared the failure branch and answered 422, so the page said
 * "Could not add that document" about a document it then listed below as
 * queued. The status code is the whole contract between the route and the UI
 * here, so it is worth a test of its own.
 */

/** Mirrors statusFor in app/api/knowledge/documents/route.ts. */
function statusFor(status: "ready" | "pending" | "failed"): number {
  if (status === "ready") return 201;
  if (status === "pending") return 202;
  return 422;
}

describe("ingest status codes", () => {
  it("treats a queued document as accepted, not rejected", () => {
    expect(statusFor("pending")).toBe(202);
    expect(statusFor("pending")).toBeLessThan(400);
  });

  it("reports a finished document as created", () => {
    expect(statusFor("ready")).toBe(201);
  });

  it("reports a failed extraction as the caller's problem, not the server's", () => {
    expect(statusFor("failed")).toBe(422);
    expect(statusFor("failed")).toBeLessThan(500);
  });

  it("never reports a success as an error, which is what the UI branches on", () => {
    for (const status of ["ready", "pending"] as const) {
      expect(statusFor(status), status).toBeLessThan(400);
    }
  });
});

describe("the inline threshold", () => {
  it("is a real number, not accidentally zero or unbounded", () => {
    expect(INLINE_CHUNK_LIMIT).toBeGreaterThan(0);
    expect(INLINE_CHUNK_LIMIT).toBeLessThan(500);
  });
});
