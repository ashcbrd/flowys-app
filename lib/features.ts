/**
 * Feature Flags
 *
 * One place to turn a feature off across the whole UI while it isn't ready.
 *
 * The backend for a disabled feature is left intact, routes, models and node
 * handlers keep working, so turning the flag back on is the only step needed to
 * restore it. Nothing here deletes data or capability.
 */

/**
 * App integrations (Slack, GitHub, Notion, and the rest).
 *
 * Off until the OAuth apps are registered and connections actually work. While
 * off, every entry point shows "Coming soon" instead of leading somewhere that
 * can't succeed yet.
 */
export const INTEGRATIONS_ENABLED = false;

/** Shown wherever a disabled feature is surfaced. */
export const COMING_SOON_LABEL = "Coming soon";

/**
 * Credit metering.
 *
 * This deployment runs on one shared demo account, so counting credits only ever
 * stops someone from trying the product. The metering code stays in place and
 * still records what a run would have cost; it simply never refuses a run.
 *
 * Set this to false to enforce credits again.
 */
export const UNLIMITED_CREDITS = true;
