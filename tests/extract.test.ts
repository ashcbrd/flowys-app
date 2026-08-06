import { describe, it, expect } from "vitest";
import { extractFromFile, htmlToText } from "@/lib/knowledge/extract";
import { fuseByReciprocalRank } from "@/lib/knowledge/retrieval";
import { isPrivateOrReservedHost, vetOutboundUrl } from "@/lib/security/url-guard";

describe("extractFromFile routing", () => {
  it("reads plain text as-is", async () => {
    const out = await extractFromFile("notes.txt", Buffer.from("hello world"));
    expect(out.text).toBe("hello world");
    expect(out.title).toBe("notes.txt");
  });

  it("routes a PDF by magic bytes even when the extension lies", async () => {
    // A real-enough header to be routed as PDF; parsing then fails loudly with
    // the PDF message, not the generic one, proving the routing happened.
    const fakePdf = Buffer.from("%PDF-1.4 not actually parseable");
    await expect(extractFromFile("renamed.txt", fakePdf)).rejects.toThrow(/PDF|read/i);
  });

  it("refuses an empty file with a sentence, not a stack trace", async () => {
    await expect(extractFromFile("empty.txt", Buffer.alloc(0))).rejects.toThrow(/empty/);
  });

  it("refuses binary junk pretending to be text", async () => {
    const junk = Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 7) % 256));
    await expect(extractFromFile("data.txt", junk)).rejects.toThrow(/readable text/);
  });

  it("tells .doc users what to do instead", async () => {
    await expect(extractFromFile("old.doc", Buffer.from("x"))).rejects.toThrow(/docx or PDF/i);
  });

  it("names the extension it cannot read", async () => {
    await expect(extractFromFile("img.png", Buffer.from("x"))).rejects.toThrow(/\.png/);
  });
});

describe("htmlToText", () => {
  it("keeps headings as markdown so chunking keeps document structure", () => {
    const html = "<html><head><title>Help Centre</title></head><body><h1>Refunds</h1><p>Thirty days.</p><h2>Shipping</h2><p>Next day.</p></body></html>";
    const out = htmlToText(html);
    expect(out.title).toBe("Help Centre");
    expect(out.text).toContain("# Refunds");
    expect(out.text).toContain("## Shipping");
    expect(out.text).toContain("Thirty days.");
  });

  it("drops scripts, styles and chrome", () => {
    const html = `<body><script>alert(1)</script><style>.x{}</style><nav>Home About</nav><header>Logo</header><p>The content.</p><footer>Legal</footer></body>`;
    const out = htmlToText(html);
    expect(out.text).toBe("The content.");
  });

  it("decodes entities", () => {
    const out = htmlToText("<p>Fish &amp; chips &#8211; &quot;good&quot;</p>");
    expect(out.text).toContain('Fish & chips');
    expect(out.text).toContain('"good"');
  });

  it("fails loudly on a page with no content", () => {
    expect(() => htmlToText("<script>only()</script>")).toThrow(/No readable text/);
  });
});

describe("URL vetting", () => {
  it("blocks private and metadata addresses", () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "172.20.1.1", "192.168.1.1", "169.254.169.254", "internal.local"]) {
      expect(isPrivateOrReservedHost(host), host).toBe(true);
    }
  });

  it("allows public hosts", () => {
    for (const host of ["example.com", "8.8.8.8", "docs.google.com"]) {
      expect(isPrivateOrReservedHost(host), host).toBe(false);
    }
  });

  it("vets whole URLs, protocol included", () => {
    expect(vetOutboundUrl("ftp://example.com").error).toMatch(/http/);
    expect(vetOutboundUrl("not a url").error).toMatch(/valid/);
    expect(vetOutboundUrl("http://169.254.169.254/latest/meta-data").error).toMatch(/private/);
    expect(vetOutboundUrl("https://example.com/page").url?.hostname).toBe("example.com");
  });
});

describe("reciprocal rank fusion", () => {
  const hit = (documentId: string, ord: number, text = "t") => ({
    documentId,
    knowledgeBaseId: "kb",
    ord,
    text,
  });

  it("ranks an item found by both legs above items found by one", () => {
    const vector = [hit("a", 0), hit("b", 0), hit("c", 0)];
    const keyword = [hit("d", 0), hit("b", 0)];

    const fused = fuseByReciprocalRank([vector, keyword], 4);
    expect(fused[0].documentId).toBe("b");
  });

  it("preserves single-leg results when the other leg is empty, the vector-only fallback", () => {
    const vector = [hit("a", 0), hit("b", 0)];
    const fused = fuseByReciprocalRank([vector, []], 5);
    expect(fused.map((f) => f.documentId)).toEqual(["a", "b"]);
  });

  it("caps at topK", () => {
    const many = Array.from({ length: 30 }, (_, i) => hit(`d${i}`, 0));
    expect(fuseByReciprocalRank([many, []], 5)).toHaveLength(5);
  });

  it("treats the same document's different chunks as different items", () => {
    const vector = [hit("a", 0), hit("a", 1)];
    const fused = fuseByReciprocalRank([vector, []], 5);
    expect(fused).toHaveLength(2);
  });
});
