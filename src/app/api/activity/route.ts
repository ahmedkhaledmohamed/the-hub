import { NextRequest, NextResponse } from "next/server";
import {
  trackOpen,
  trackSearch,
  getActivitySummary,
  getBoostScores,
  getSearchGaps,
} from "@/lib/activity";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity              — activity summary (7 days)
 * GET /api/activity?days=14      — custom date range
 * GET /api/activity?boosts=true  — ranking boost scores for Cmd+K
 * GET /api/activity?gaps=true    — search gaps (queries with 0 results)
 */
export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
  const boosts = req.nextUrl.searchParams.get("boosts") === "true";
  const gaps = req.nextUrl.searchParams.get("gaps") === "true";

  if (boosts) {
    const scores = getBoostScores(days);
    return NextResponse.json({ boosts: Object.fromEntries(scores) });
  }

  if (gaps) {
    const searchGaps = getSearchGaps(days);
    return NextResponse.json({ gaps: searchGaps });
  }

  const summary = getActivitySummary(days);
  return NextResponse.json(summary);
}

/**
 * POST /api/activity — track an event
 * Body: { type: "open", path } or { type: "search", query, resultCount, clickedPath? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    type: "open" | "search";
    path?: string;
    query?: string;
    resultCount?: number;
    clickedPath?: string;
  };

  if (body.type === "open" && body.path) {
    trackOpen(body.path);
    return NextResponse.json({ tracked: true, type: "open", path: body.path });
  }

  if (body.type === "search" && body.query) {
    trackSearch(body.query, body.resultCount || 0, body.clickedPath);
    return NextResponse.json({ tracked: true, type: "search", query: body.query });
  }

  return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
}
