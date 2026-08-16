import { describe, it, expect } from "vitest";
import { categorizeRun, firstImageUrl } from "@/lib/results/categorize";

describe("categorizeRun", () => {
  it("files a failed run as failed regardless of what it produced", () => {
    expect(
      categorizeRun({ status: "failed", logOutputs: [{ boardMarkdown: "x" }] })
    ).toBe("failed");
  });

  it("the richer artifact wins: brand over its own images", () => {
    expect(
      categorizeRun({
        status: "completed",
        logOutputs: [{ imageUrl: "/api/assets/x.png" }, { boardMarkdown: "# B" }],
      })
    ).toBe("brand");
  });

  it("email wins over the written copy inside it", () => {
    expect(
      categorizeRun({
        status: "completed",
        format: "markdown",
        logOutputs: [{ emailHtml: "<html/>", previewUrl: "/api/assets/x.html" }],
      })
    ).toBe("email");
  });

  it("a lone picture run files under pictures", () => {
    expect(
      categorizeRun({
        status: "completed",
        format: "markdown",
        logOutputs: [{ imageMarkdown: "![](/api/assets/x.png)" }],
      })
    ).toBe("picture");
  });

  it("markdown and text results with no artifacts are written", () => {
    expect(
      categorizeRun({ status: "completed", format: "markdown", logOutputs: [{ a: 1 }] })
    ).toBe("written");
    expect(
      categorizeRun({ status: "completed", format: "text", logOutputs: [] })
    ).toBe("written");
  });

  it("everything else is data", () => {
    expect(
      categorizeRun({ status: "completed", format: "json", logOutputs: [{ a: 1 }] })
    ).toBe("data");
  });

  it("survives steps that produced nothing", () => {
    expect(
      categorizeRun({ status: "completed", logOutputs: [undefined, undefined] })
    ).toBe("data");
  });
});

describe("firstImageUrl", () => {
  const id = "01234567-89ab-4cde-8f01-23456789abcd";

  it("finds an image anywhere in a step's output, markdown included", () => {
    expect(
      firstImageUrl([{ note: `see ![x](/api/assets/${id}.png)` }])
    ).toBe(`/api/assets/${id}.png`);
  });

  it("returns null when no run image exists", () => {
    expect(firstImageUrl([{ previewUrl: `/api/assets/${id}.html` }, undefined])).toBeNull();
  });
});
