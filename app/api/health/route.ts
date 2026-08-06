import { NextResponse } from "next/server";

/**
 * Liveness, plus which build is answering.
 *
 * The commit is here because "is my change deployed yet" was, for a while, a
 * question nobody could answer from outside: every route looked the same
 * whichever build served it, so a stale deployment and a broken route were
 * indistinguishable. Vercel injects the sha at build time.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? undefined : "local",
  });
}
