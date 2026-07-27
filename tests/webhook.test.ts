import { describe, expect, it, vi, afterEach } from "vitest";
import { WebhookNodeHandler } from "@/lib/nodes/webhook";

/**
 * The webhook step is the one place a workflow hands its result to the outside
 * world, so how it behaves when that fails decides whether a run's work survives.
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const handler = new WebhookNodeHandler();

const run = (config: Record<string, unknown>, inputs: Record<string, unknown> = {}) =>
  handler.execute({ nodeId: "n1", inputs, config, globalContext: {} });

describe("payload templates", () => {
  it("sends multi-line values without corrupting the payload", async () => {
    // The template used to be stringified, interpolated as text, then re-parsed —
    // which broke on any newline or quote. A markdown result contains both.
    let sent: unknown;
    globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const markdown = '# Heading\n\nA "quoted" line\n- a bullet';
    const result = await run(
      { url: "https://example.com/hook", payloadTemplate: { body: "{{result}}" } },
      { result: markdown }
    );

    expect(result.success).toBe(true);
    expect((sent as { body: string }).body).toBe(markdown);
  });

  it("keeps non-string values as their own type", async () => {
    let sent: unknown;
    globalThis.fetch = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    await run(
      { url: "https://example.com/hook", payloadTemplate: { n: 1, flag: true, note: "{{note}}" } },
      { note: "hello" }
    );

    expect(sent).toEqual({ n: 1, flag: true, note: "hello" });
  });
});

describe("continueOnError", () => {
  const unreachable = () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
  };

  it("survives an unreachable receiver when told to continue", async () => {
    // Without this, a receiver being down threw away everything the earlier steps
    // had already produced.
    unreachable();
    const result = await run({
      url: "https://example.com/hook",
      payloadTemplate: { a: 1 },
      continueOnError: true,
    });

    expect(result.success).toBe(true);
    expect(result.output?.success).toBe(false);
  });

  it("fails on an unreachable receiver when not told to continue", async () => {
    unreachable();
    const result = await run({ url: "https://example.com/hook", payloadTemplate: { a: 1 } });
    expect(result.success).toBe(false);
  });

  it("survives an HTTP error when told to continue", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500, statusText: "Server Error" })) as typeof fetch;

    const result = await run({
      url: "https://example.com/hook",
      payloadTemplate: { a: 1 },
      continueOnError: true,
    });

    expect(result.success).toBe(true);
    expect(result.output?.statusCode).toBe(500);
  });

  it("survives a timeout when told to continue", async () => {
    globalThis.fetch = (async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }) as typeof fetch;

    const result = await run({
      url: "https://example.com/hook",
      payloadTemplate: { a: 1 },
      continueOnError: true,
    });

    expect(result.success).toBe(true);
  });
});

describe("safety", () => {
  it("refuses a private address", async () => {
    const result = await run({ url: "http://127.0.0.1:3001/hook", payloadTemplate: { a: 1 } });
    expect(result.success).toBe(false);
  });
});
