import { NextRequest, NextResponse } from "next/server";
import { processDueSchedules } from "@/lib/services/scheduler";

// This endpoint can be called by:
// 1. Vercel Cron Jobs (add to vercel.json)
// 2. External cron services (e.g., cron-job.org)
// 3. Manual trigger for testing

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication for production
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is set, require authentication
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await processDueSchedules();

    return NextResponse.json({
      success: true,
      ...result,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error processing schedules:", error);
    return NextResponse.json(
      { error: "Failed to process schedules" },
      { status: 500 }
    );
  }
}

// Also allow GET for simple cron services
export async function GET(request: NextRequest) {
  return POST(request);
}
