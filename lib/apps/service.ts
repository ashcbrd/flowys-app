import { connectToDatabase, Workflow } from "@/lib/db";
import { AppListing } from "@/lib/db/models/AppListing";
import { AppVersion } from "@/lib/db/models/AppVersion";
import { getWorkspaceRole } from "@/lib/workspaces/service";
import { userCanAccessApp } from "./access";
import type { IAppListing } from "@/lib/db/models/AppListing";

/**
 * Freeze the app's workflow into a new immutable version and make it the live
 * one. Each call produces the next version number; publishing never mutates a
 * prior version.
 */
export async function publishApp(
  appListingId: string,
  publishedByUserId: string
): Promise<string> {
  await connectToDatabase();

  const listing = await AppListing.findById(appListingId);
  if (!listing) throw new Error("App not found");

  const workflow = await Workflow.findById(listing.workflowId).lean();
  if (!workflow) throw new Error("Workflow not found");

  const last = await AppVersion.findOne({ appListingId }).sort({ version: -1 }).lean();
  const version = (last?.version ?? 0) + 1;

  const created = await AppVersion.create({
    appListingId,
    workspaceId: listing.workspaceId,
    version,
    snapshot: { nodes: workflow.nodes, edges: workflow.edges },
    publishedByUserId,
  });

  listing.currentVersionId = created._id;
  listing.status = "published";
  await listing.save();

  return created._id;
}

/** Point the live app at an existing prior version. */
export async function rollbackApp(appListingId: string, versionId: string): Promise<void> {
  await connectToDatabase();
  const version = await AppVersion.findOne({ _id: versionId, appListingId }).lean();
  if (!version) throw new Error("Version not found");
  await AppListing.updateOne({ _id: appListingId }, { $set: { currentVersionId: versionId } });
}

/** The snapshot the app currently runs, or null if it has no live version. */
export async function getCurrentSnapshot(
  appListingId: string
): Promise<{ nodes: unknown[]; edges: unknown[] } | null> {
  await connectToDatabase();
  const listing = await AppListing.findById(appListingId).lean();
  if (!listing?.currentVersionId) return null;
  const version = await AppVersion.findById(listing.currentVersionId).lean();
  return (version?.snapshot as { nodes: unknown[]; edges: unknown[] }) ?? null;
}

/**
 * Load an app for a user, enforcing workspace membership + the app's audience.
 * Returns null (not an error) when the user may not access it, so callers can
 * treat "no access" and "not found" identically — no existence leak.
 */
export async function getAppForUser(
  appListingId: string,
  userId: string
): Promise<IAppListing | null> {
  await connectToDatabase();
  const listing = await AppListing.findById(appListingId).lean<IAppListing>();
  if (!listing) return null;
  const role = await getWorkspaceRole(listing.workspaceId, userId);
  if (!userCanAccessApp(listing.audience, { userId, role })) return null;
  return listing;
}
