/**
 * Split extracted text into embedding-sized pieces.
 *
 * Two things decide whether retrieval works, and neither is the embedding model:
 * whether a chunk holds one whole idea, and whether the reader can tell where it
 * came from. So chunks break on structure first (headings, then paragraphs) and
 * only fall back to splitting mid-paragraph when a single paragraph is longer
 * than the budget. Each chunk carries the heading it lived under, which is what
 * a citation shows and what a reranker reads first.
 *
 * Sizing is in tokens, estimated rather than tokenised. A real tokeniser is a
 * megabyte of tables to save a few percent of accuracy on a number that only has
 * to stay comfortably under the model's 8191-token input limit. `estimateTokens`
 * is deliberately conservative: it over-counts rather than under-counts, so a
 * chunk that measures 500 is never actually 700.
 */

/** Target size of one chunk, in estimated tokens. */
export const DEFAULT_CHUNK_TOKENS = 500;

/** How much of the previous chunk repeats at the start of the next, as a fraction. */
export const DEFAULT_OVERLAP_RATIO = 0.12;

/**
 * Rough token count for English prose.
 *
 * OpenAI's rule of thumb is ~4 characters per token. Whitespace-heavy text and
 * code run shorter per token, so we take the larger of the character estimate
 * and the word count: over-estimating costs a slightly smaller chunk, while
 * under-estimating risks a rejected embedding request.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const byChars = Math.ceil(text.length / 4);
  const byWords = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.max(byChars, byWords);
}

export interface TextChunk {
  /** Zero-based position of this chunk within the document. */
  ord: number;
  text: string;
  tokens: number;
  /** The nearest heading above this chunk, if the source had one. */
  heading?: string;
}

export interface ChunkOptions {
  maxTokens?: number;
  overlapRatio?: number;
}

interface Block {
  heading?: string;
  paragraphs: string[];
}

/** Markdown ATX heading (`## Title`) or an underlined setext heading. */
const ATX_HEADING = /^#{1,6}\s+(.*\S)\s*$/;

/**
 * Group the document into blocks, one per heading, so a chunk never silently
 * spans two sections. Text before the first heading forms an untitled block.
 */
function toBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let current: Block = { paragraphs: [] };
  let buffer: string[] = [];

  const flushParagraph = () => {
    const joined = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (joined) current.paragraphs.push(joined);
    buffer = [];
  };

  const flushBlock = () => {
    flushParagraph();
    if (current.paragraphs.length) blocks.push(current);
  };

  for (const line of lines) {
    const atx = line.match(ATX_HEADING);
    if (atx) {
      flushBlock();
      current = { heading: atx[1], paragraphs: [] };
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    buffer.push(line.trim());
  }
  flushBlock();

  return blocks;
}

/**
 * Break a paragraph that is on its own larger than the budget.
 *
 * Sentence boundaries first, because a chunk cut mid-sentence retrieves badly.
 * Only a single sentence over budget falls through to a hard word split.
 */
function splitOversizedParagraph(paragraph: string, maxTokens: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) out.push(trimmed);
    current = "";
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (estimateTokens(sentence) > maxTokens) {
      pushCurrent();
      const words = sentence.split(/\s+/);
      let piece = "";
      for (const word of words) {
        const candidate = piece ? `${piece} ${word}` : word;
        if (estimateTokens(candidate) > maxTokens && piece) {
          out.push(piece);
          piece = word;
        } else {
          piece = candidate;
        }
      }
      if (piece) out.push(piece);
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > maxTokens && current) {
      pushCurrent();
      current = sentence;
    } else {
      current = candidate;
    }
  }
  pushCurrent();

  return out;
}

/**
 * Take the tail of `text` worth at most `overlapTokens`, cut on a word boundary.
 * Overlap exists so an idea split across a chunk edge is still retrievable from
 * either side.
 *
 * The budget is a ceiling, not a target. Overshooting here would push the next
 * chunk past `maxTokens`, because the tail is prepended to a piece that is
 * already allowed to fill the content budget.
 */
function tailForOverlap(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return "";
  const words = text.split(/\s+/);
  const tail: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = [words[i], ...tail];
    if (estimateTokens(candidate.join(" ")) > overlapTokens) break;
    tail.unshift(words[i]);
  }
  return tail.join(" ");
}

/**
 * Split text into overlapping chunks, respecting headings and paragraphs.
 *
 * Returns an empty array for empty or whitespace-only input rather than one
 * empty chunk, so a document that extracted to nothing produces no rows and can
 * be reported as failed instead of silently indexing a blank.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_CHUNK_TOKENS;
  const overlapRatio = options.overlapRatio ?? DEFAULT_OVERLAP_RATIO;

  if (maxTokens <= 0) throw new Error("maxTokens must be greater than zero");
  if (overlapRatio < 0 || overlapRatio >= 1) {
    throw new Error("overlapRatio must be at least 0 and below 1");
  }

  const overlapTokens = Math.floor(maxTokens * overlapRatio);

  // A chunk is [overlap tail] + [new content], and the pair has to fit inside
  // maxTokens. So new content is only ever allowed the remainder. Without this
  // the default settings produce 560-token chunks against a 500-token budget.
  const contentBudget = Math.max(1, maxTokens - overlapTokens);

  const chunks: TextChunk[] = [];

  for (const block of toBlocks(text)) {
    // Within one heading, pack paragraphs until the budget is reached.
    let current = "";

    const emit = () => {
      const body = current.trim();
      if (!body) return;
      chunks.push({
        ord: chunks.length,
        text: body,
        tokens: estimateTokens(body),
        ...(block.heading ? { heading: block.heading } : {}),
      });
      current = tailForOverlap(body, overlapTokens);
    };

    for (const paragraph of block.paragraphs) {
      const pieces =
        estimateTokens(paragraph) > contentBudget
          ? splitOversizedParagraph(paragraph, contentBudget)
          : [paragraph];

      for (const piece of pieces) {
        const candidate = current ? `${current}\n\n${piece}` : piece;
        if (estimateTokens(candidate) > maxTokens && current) {
          emit();
          current = current ? `${current}\n\n${piece}` : piece;
        } else {
          current = candidate;
        }
      }
    }

    // The trailing overlap tail is not a chunk of its own.
    const body = current.trim();
    if (body) {
      const last = chunks[chunks.length - 1];
      if (!last || last.text !== body) {
        chunks.push({
          ord: chunks.length,
          text: body,
          tokens: estimateTokens(body),
          ...(block.heading ? { heading: block.heading } : {}),
        });
      }
    }
  }

  return chunks.map((chunk, ord) => ({ ...chunk, ord }));
}
