/**
 * Turning text into vectors, behind one interface.
 *
 * The dimension of these vectors is not a free parameter. It is written into the
 * Atlas Vector Search index definition, and a mismatch does not fail loudly: the
 * index silently stops matching, and retrieval returns nothing while every other
 * part of the system reports success. So the dimension is asserted on every
 * response rather than trusted, and `EMBEDDING_DIMENSIONS` is the single value
 * that must agree with the Atlas index.
 *
 * Retry discipline matches `lib/providers`: a 401, 403, 429 or quota error will
 * not succeed on a second attempt, so retrying one only spends money and delays
 * the moment someone finds out ingestion is broken.
 */
import OpenAI from "openai";

/** The model every chunk in the corpus is embedded with. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Must equal `numDimensions` in the Atlas vector index definition on `Chunk.embedding`. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * How many texts go in one request.
 *
 * The API accepts far more, but a batch also has a combined token ceiling, and a
 * rejected batch costs a whole round trip. Chunks are ~500 tokens, so 96 of them
 * is roughly 48k tokens: comfortably inside the limit with room for outliers.
 */
export const EMBEDDING_BATCH_SIZE = 96;

const MAX_ATTEMPTS = 3;

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  /** Embed in order. `out[i]` is the vector for `texts[i]`. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Errors that will never succeed on a retry, so we fail fast and loudly instead. */
export function isTerminalEmbeddingError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403 || status === 429) return true;

  const message = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("api key") ||
    message.includes("quota") ||
    message.includes("insufficient_quota") ||
    message.includes("unauthorized")
  );
}

/** Split a list into fixed-size batches, preserving order. */
export function batched<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("batch size must be greater than zero");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The slice of the OpenAI SDK this file uses.
 *
 * Deliberately narrower than `OpenAI["embeddings"]`: the SDK's `create` returns
 * an `APIPromise`, and depending on that type would force every test double to
 * fake seven internal fields it never touches. The real client satisfies this
 * structurally.
 */
export interface EmbeddingsClient {
  create(args: { model: string; input: string[]; dimensions?: number }): Promise<{
    data: { index: number; embedding: number[] }[];
  }>;
}

export interface OpenAIEmbeddingOptions {
  apiKey?: string;
  model?: string;
  dimensions?: number;
  batchSize?: number;
  /** Injectable for tests; defaults to a real OpenAI client. */
  client?: EmbeddingsClient;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly batchSize: number;
  private readonly embeddings: EmbeddingsClient;

  constructor(options: OpenAIEmbeddingOptions = {}) {
    this.model = options.model ?? EMBEDDING_MODEL;
    this.dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS;
    this.batchSize = options.batchSize ?? EMBEDDING_BATCH_SIZE;
    this.embeddings =
      options.client ??
      new OpenAI({ apiKey: options.apiKey || process.env.OPENAI_API_KEY }).embeddings;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (texts.some((t) => !t.trim())) {
      throw new Error("cannot embed an empty string; drop empty chunks before embedding");
    }

    const out: number[][] = [];
    for (const batch of batched(texts, this.batchSize)) {
      out.push(...(await this.embedBatch(batch)));
    }
    return out;
  }

  private async embedBatch(batch: string[]): Promise<number[][]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.embeddings.create({
          model: this.model,
          input: batch,
          dimensions: this.dimensions,
        });

        const data = response.data ?? [];
        if (data.length !== batch.length) {
          throw new Error(
            `embedding count mismatch: asked for ${batch.length}, got ${data.length}`
          );
        }

        // The API documents that results come back in request order, but a
        // reordered response would silently attach the wrong vector to every
        // chunk, so sort by the index it reports rather than trusting it.
        const ordered = [...data].sort((a, b) => a.index - b.index);

        return ordered.map((item) => {
          const vector = item.embedding as number[];
          if (vector.length !== this.dimensions) {
            throw new Error(
              `embedding dimension mismatch: expected ${this.dimensions}, got ${vector.length}. ` +
                `This will not error at query time, it will silently return no matches.`
            );
          }
          return vector;
        });
      } catch (error) {
        lastError = error;
        if (isTerminalEmbeddingError(error)) throw error;
        if (attempt === MAX_ATTEMPTS - 1) break;
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`embedding failed after ${MAX_ATTEMPTS} attempts`);
  }
}

let cached: EmbeddingProvider | null = null;

/** The provider the ingestion pipeline and retrieval both use. */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) cached = new OpenAIEmbeddingProvider();
  return cached;
}

/** Test seam: replace or reset the cached provider. */
export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  cached = provider;
}
