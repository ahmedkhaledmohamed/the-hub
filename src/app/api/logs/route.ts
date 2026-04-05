import { NextRequest, NextResponse } from "next/server";
import {
  getRecentLogs,
  getLogSummary,
  getTimingStats,
  pruneLogs,
} from "@/lib/logger";
import type { LogCategory, LogLevel } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/logs                           — recent logs (default 100)
 * GET /api/logs?category=scan             — filter by category
 * GET /api/logs?level=error               — filter by level
 * GET /api/logs?summary=true              — counts by category/level
 * GET /api/logs?timing=scan               — timing stats for a category
 */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") as LogCategory | null;
  const level = req.nextUrl.searchParams.get("level") as LogLevel | null;
  const summary = req.nextUrl.searchParams.get("summary");
  const timing = req.nextUrl.searchParams.get("timing") as LogCategory | null;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
  const since = req.nextUrl.searchParams.get("since") || undefined;

  if (summary === "true") {
    return NextResponse.json({ summary: getLogSummary(since) });
  }

  if (timing) {
    const hours = parseInt(req.nextUrl.searchParams.get("hours") || "24", 10);
    return NextResponse.json({ category: timing, stats: getTimingStats(timing, hours) });
  }

  const logs = getRecentLogs({
    limit: Math.min(limit, 500),
    category: category || undefined,
    level: level || undefined,
    since,
  });

  return NextResponse.json({ logs, count: logs.length });
}

/**
 * POST /api/logs
 * { action: "prune", olderThanDays?: number }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action === "prune") {
    const days = (body.olderThanDays as number) || 7;
    const removed = pruneLogs(days);
    return NextResponse.json({ removed });
  }

  return NextResponse.json({ error: "action must be prune" }, { status: 400 });
}
