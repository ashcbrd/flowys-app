import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { executeNode } from "@/lib/nodes";
import { connectToDatabase, Asset } from "@/lib/db";

/**
 * The email step against the real database: the assembled HTML must land as a
 * stored preview, escaped, with the layout's structural guarantees intact.
 */

const hasEnv = !!process.env.MONGODB_URI;
const live = hasEnv ? describe : describe.skip;

live("email step, against real storage", () => {
  const userId = `test-user-${uuid()}`;

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await Asset.deleteMany({ userId });
  });

  it("assembles, stores the preview, and hands on sender-shaped output", async () => {
    const result = await executeNode("email", {
      nodeId: "live-email",
      inputs: {
        subject: "The live test ran",
        body: "It reached the database.\n\n- and stored the preview\n- and came back",
        color: "#0a6cff",
      },
      config: {
        layout: "promo",
        subjectTemplate: "{{subject}}",
        headingTemplate: "{{subject}}",
        bodyTemplate: "{{body}}",
        brandColorTemplate: "{{color}}",
        ctaTextTemplate: "Open it",
        ctaUrlTemplate: "https://example.com",
      },
      globalContext: {},
      userId,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.output?.subject).toBe("The live test ran");

    const previewUrl = result.output?.previewUrl as string;
    expect(previewUrl).toMatch(/^\/api\/assets\/[0-9a-f-]{36}\.html$/);

    const id = previewUrl.match(/([0-9a-f-]{36})/)![1];
    const asset = await Asset.findById(id);
    expect(asset).not.toBeNull();
    expect(asset!.kind).toBe("email");
    expect(asset!.contentType).toBe("text/html");

    const html = asset!.data.toString("utf8");
    expect(html).toBe(result.output?.emailHtml);
    expect(html).toContain("The live test ran");
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain("<script");
  }, 30_000);
});
