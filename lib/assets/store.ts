/**
 * The one write and read path for binary assets.
 *
 * Every step that produces bytes goes through here, and the templates test
 * mocks exactly this module, so the seam between "a step ran" and "bytes
 * landed in the database" stays one file wide.
 */
import { connectToDatabase } from "@/lib/db";
import { Asset, type AssetKind, type IAsset } from "@/lib/db/models/Asset";

export interface SaveAssetOptions {
  userId: string;
  kind: AssetKind;
  contentType: string;
  data: Buffer;
  prompt?: string;
  model?: string;
}

export interface SavedAsset {
  id: string;
  /** The path a browser can load, extension included so the result renderer
   *  can tell an image from a page without a lookup. */
  url: string;
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "text/html": "html",
};

export async function saveAsset(options: SaveAssetOptions): Promise<SavedAsset> {
  await connectToDatabase();

  const created = await Asset.create({
    userId: options.userId,
    kind: options.kind,
    contentType: options.contentType,
    data: options.data,
    bytes: options.data.length,
    prompt: options.prompt,
    model: options.model,
  });

  const ext = EXTENSION[options.contentType] ?? "bin";
  return { id: created._id, url: `/api/assets/${created._id}.${ext}` };
}

/**
 * An asset's bytes, but only for its owner. Steps run as the workflow owner
 * on every trigger path, so a step reading an asset it did not create would
 * mean one user's run reading another user's images. The serving route has a
 * wider audience (workspace members); step-to-step access does not.
 */
export async function getOwnedAssetData(
  assetId: string,
  userId: string
): Promise<Pick<IAsset, "data" | "contentType" | "kind"> | null> {
  await connectToDatabase();

  const asset = await Asset.findOne({ _id: assetId, userId })
    .select({ data: 1, contentType: 1, kind: 1 })
    .lean();

  if (!asset) return null;

  // lean() hands the bytes back as a BSON binary, not a Node Buffer.
  const raw = asset.data as unknown;
  const data = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from((raw as { buffer: Uint8Array }).buffer ?? (raw as Uint8Array));

  return { data, contentType: asset.contentType, kind: asset.kind };
}

/** Strip "/api/assets/<id>.png" or a bare id down to the id. */
export function parseAssetId(reference: string): string | null {
  const match = reference
    .trim()
    .match(/^(?:\/api\/assets\/)?([0-9a-f-]{36})(?:\.\w+)?$/i);
  return match ? match[1] : null;
}
