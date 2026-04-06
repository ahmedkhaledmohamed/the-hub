import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyDigest, formatDigestText, postWeeklyDigest } from "@/lib/weekly-digest";
import {
  startDigestScheduler,
  stopDigestScheduler,
  runDigest,
  getDigestScheduleStatus,
  isDigestSchedulerActive,
} from "@/lib/digest-scheduler";

export const dynamic = "force-dynamic";

/**
 * GET /api/digest              — generate weekly digest
 * GET /api/digest?format=text  — plain text format
 * GET /api/digest?days=14      — custom lookback
 * GET /api/digest?schedule=true — scheduler status
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
  const schedule = req.nextUrl.searchParams.get("schedule");

  if (schedule === "true") {
    return NextResponse.json(getDigestScheduleStatus());
  }

  const digest = generateWeeklyDigest(days);

  if (format === "text") {
    return new Response(formatDigestText(digest), { headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json(digest);
}

/**
 * POST /api/digest
 * { action: "post-slack", days?: number }   — generate and post to Slack
 * { action: "run-now" }                     — run digest immediately
 * { action: "start-scheduler" }             — start scheduled runs
 * { action: "stop-scheduler" }              — stop scheduled runs
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "post-slack") {
    const days = (body.days as number) || 7;
    const result = await postWeeklyDigest(days);
    return NextResponse.json(result);
  }

  if (action === "run-now") {
    const result = await runDigest();
    return NextResponse.json(result);
  }

  if (action === "start-scheduler") {
    const intervalMs = body.intervalMs as number | undefined;
    startDigestScheduler({ intervalMs, runImmediately: body.runImmediately as boolean });
    return NextResponse.json({ started: true, status: getDigestScheduleStatus() });
  }

  if (action === "stop-scheduler") {
    stopDigestScheduler();
    return NextResponse.json({ stopped: true, active: isDigestSchedulerActive() });
  }

  return NextResponse.json({ error: "action must be post-slack, run-now, start-scheduler, or stop-scheduler" }, { status: 400 });
}
