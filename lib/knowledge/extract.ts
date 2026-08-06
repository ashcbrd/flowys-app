/**
 * Turn what a person actually has, a PDF from legal, a DOCX from operations, a
 * page on their own website, into the plain text the chunker eats.
 *
 * Every path funnels into one shape, `Extracted`, so ingestion downstream never
 * knows or cares where text came from. The rule for failures: an extractor that
 * cannot read a file says so in a sentence a non-technical person can act on,
 * because "Unsupported media type" tells the person who uploaded the file
 * nothing about what to do next.
 */
import { vetOutboundUrl } from "@/lib/security/url-guard";

export interface Extracted {
  text: string;
  /** Where a title can be recovered (HTML <title>, filename), it is. */
  title?: string;
}

/** Documents over this size are refused before any parsing work happens. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".log"];

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * Extract text from an uploaded file, routed by extension with a content-based
 * fallback: a PDF renamed to .txt is still a PDF, and its magic bytes say so
 * more reliably than its name.
 */
export async function extractFromFile(filename: string, buffer: Buffer): Promise<Extracted> {
  if (buffer.length === 0) {
    throw new Error("That file is empty");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("That file is over 10 MB. Try a smaller one, or split it.");
  }

  const ext = extension(filename);
  const looksPdf = buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  // DOCX is a zip; PK\x03\x04 is the zip local-file-header signature.
  const looksZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

  if (ext === ".pdf" || looksPdf) {
    return extractPdf(buffer, filename);
  }
  if (ext === ".docx" || (looksZip && ext !== ".zip")) {
    return extractDocx(buffer, filename);
  }
  if (ext === ".doc") {
    throw new Error(
      "Old-style .doc files cannot be read. Save it as .docx or PDF and upload that instead."
    );
  }
  if (TEXT_EXTENSIONS.includes(ext) || ext === "") {
    const text = buffer.toString("utf8");
    // A binary file read as UTF-8 is full of replacement characters. Refusing
    // it beats indexing garbage that answers questions with noise.
    const junk = (text.match(/�/g) ?? []).length;
    if (junk > text.length / 100) {
      throw new Error(
        "That file does not look like readable text. PDFs, Word documents and plain text work."
      );
    }
    return { text, title: filename };
  }

  throw new Error(
    `Files ending in ${ext} cannot be read yet. PDFs, Word documents (.docx) and plain text work.`
  );
}

async function extractPdf(buffer: Buffer, filename: string): Promise<Extracted> {
  // unpdf is ESM-only; a dynamic import keeps it out of every bundle that
  // never touches PDF ingestion.
  const { extractText, getDocumentProxy } = await import("unpdf");

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const merged = (Array.isArray(text) ? text.join("\n\n") : text).trim();

  if (!merged) {
    throw new Error(
      "No text could be read from that PDF. If it is a scan, it has pictures of words rather than words; run it through OCR first or paste the text."
    );
  }
  return { text: merged, title: filename };
}

async function extractDocx(buffer: Buffer, filename: string): Promise<Extracted> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();

  if (!text) {
    throw new Error("No text could be read from that Word document.");
  }
  return { text, title: filename };
}

const FETCH_TIMEOUT_MS = 20_000;
const MAX_FETCH_BYTES = 5 * 1024 * 1024;

/**
 * Fetch a web page and reduce it to readable text.
 *
 * The URL is vetted by the same SSRF guard as the API step, because "add this
 * page to my documents" is exactly the shape of input an attacker uses to read
 * a cloud metadata endpoint.
 */
export async function extractFromUrl(rawUrl: string): Promise<Extracted> {
  const vetted = vetOutboundUrl(rawUrl);
  if (!vetted.url) throw new Error(vetted.error);

  const response = await fetch(vetted.url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "Flowys-Knowledge/1.0 (+https://flowys.io)" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`That page answered ${response.status} instead of content`);
  }

  const raw = await response.arrayBuffer();
  if (raw.byteLength > MAX_FETCH_BYTES) {
    throw new Error("That page is over 5 MB, which is too large to index");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = Buffer.from(raw).toString("utf8");

  if (contentType.includes("text/html") || /^\s*</.test(body)) {
    return htmlToText(body, vetted.url.toString());
  }
  if (contentType.includes("application/pdf")) {
    return extractPdf(Buffer.from(raw), vetted.url.toString());
  }

  return { text: body, title: vetted.url.toString() };
}

/**
 * HTML to readable text without a readability dependency.
 *
 * Deliberately unclever: drop the parts that are never content (scripts,
 * styles, nav, header, footer), turn block boundaries into newlines, decode
 * entities, collapse whitespace. Boilerplate that survives costs a little
 * retrieval precision; a heavy readability engine costs a dependency and its
 * own failure modes. For depth-one ingestion this trade is the right one.
 */
export function htmlToText(html: string, fallbackTitle?: string): Extracted {
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || fallbackTitle;

  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Headings become markdown headings so the chunker keeps the document's
  // structure, which is what citations point at.
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
    const clean = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return clean ? `\n\n${"#".repeat(Number(level))} ${clean}\n\n` : "\n\n";
  });

  s = s
    .replace(/<\/(p|div|section|article|li|tr|blockquote|pre)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

  const text = s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new Error("No readable text was found on that page");
  }
  return { text, title };
}
