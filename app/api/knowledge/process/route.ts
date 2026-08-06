import { NextRequest, NextResponse } from "next/server";
import { processPendingDocuments } from "@/lib/knowledge/processor";

/**
 * Index queued documents. Driven by the same cron arrangement as
 * /api/schedules/process: Vercel Cron, an external scheduler, or a manual POST
 * while developing.
 *
 * Deliberately not authenticated by session. Nobody is signed in when a cron
 * service calls it, and the work it does is entirely determined by what is
 * already queued, so there is nothing to escalate: a caller cannot ask it to
 * process anything in particular.
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await processPendingDocuments();

    return NextResponse.json({ success: true, ...result, processedAt: new Date().toISOString() });
  } catch (error) {
    // A tick that throws would take the endpoint down and stop every other
    // document being processed, so failures are reported, not raised.
    console.error("Error processing documents:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}

/** Convenience for cron services that can only issue GETs. */
export const GET = POST;
