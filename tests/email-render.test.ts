import { describe, it, expect } from "vitest";
import { renderEmail, escapeHtml, EMAIL_LAYOUTS } from "@/lib/email/render";

const base = {
  layout: "newsletter" as const,
  brandColor: "#1a73e8",
  slots: {
    subject: "The new thing is live",
    preheader: "It does the thing now",
    heading: "It shipped",
    body: "First paragraph.\n\nSecond paragraph.",
    ctaText: "See it",
    ctaUrl: "https://example.com/new",
    footerText: "You signed up for this.",
  },
};

describe("email assembly", () => {
  it("renders every layout as a complete document", () => {
    for (const layout of EMAIL_LAYOUTS) {
      const html = renderEmail({ ...base, layout });
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("It shipped");
      expect(html).toContain("First paragraph.");
      expect(html).toContain("https://example.com/new");
      // The old rules, not the web's: tables, no external stylesheet.
      expect(html).toContain('role="presentation"');
      expect(html).not.toContain("<link");
      expect(html).not.toContain("<script");
    }
  });

  it("escapes every slot, so model output cannot smuggle markup", () => {
    const html = renderEmail({
      ...base,
      slots: {
        ...base.slots,
        heading: '<img src=x onerror=alert(1)>',
        body: "Hello <b>there</b> & goodbye",
      },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&lt;b&gt;there&lt;/b&gt; &amp; goodbye");
  });

  it("drops a button whose link is not http(s)", () => {
    const html = renderEmail({
      ...base,
      slots: { ...base.slots, ctaUrl: "javascript" + ":alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("See it");
  });

  it("turns dash lines into a bullet table and blank lines into paragraphs", () => {
    const html = renderEmail({
      ...base,
      slots: {
        ...base.slots,
        body: "Intro line.\n\n- first thing\n- second thing\n\nOutro line.",
      },
    });
    expect(html).toContain("&bull;");
    expect(html).toContain("first thing");
    expect(html).toContain("Outro line.");
  });

  it("falls back to a neutral colour when the brand colour is junk", () => {
    const html = renderEmail({ ...base, brandColor: "sample brandColor" });
    expect(html).toContain("<!DOCTYPE html>");
    // The junk string never lands in a style attribute.
    expect(html).not.toContain("sample brandColor");
  });

  it("hides the preheader span from the body", () => {
    const html = renderEmail(base);
    expect(html).toContain("It does the thing now");
    expect(html).toContain("display:none");
  });

  it("button text passes the contrast guard rather than assuming white", () => {
    // A pale yellow brand: white text on it would be unreadable.
    const html = renderEmail({ ...base, brandColor: "#ffee88" });
    expect(html).toContain("<!DOCTYPE html>");
    // The guard deepens the primary until its label passes; either way the
    // button renders with a label colour, never an empty style.
    expect(html).toMatch(/color:#(ffffff|1a1a1a); text-decoration:none/);
  });
});

describe("escapeHtml", () => {
  it("covers the five characters that matter", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
