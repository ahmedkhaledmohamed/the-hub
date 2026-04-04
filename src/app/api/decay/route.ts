import { NextRequest, NextResponse } from "next/server";
import { detectDecay, decaySummary, getDecayingDocs } from "@/lib/knowledge-decay";

export const dynamic = "force-dynamic";

/**
 * GET /api/decay — knowledge decay report
 * GET /api/decay?decaying=true — only critical + declining docs
 */
export async function GET(req: NextRequest) {
  const decayingOnly = req.nextUrl.searchParams.get("decaying") === "true";
  const recentDays = parseInt(req.nextUrl.searchParams.get("recent") || "7", 10);
  const historicalDays = parseInt(req.nextUrl.searchParams.get("historical") || "30", 10);

  const reports = detectDecay({ recentDays, historicalDays });
  const filtered = decayingOnly ? getDecayingDocs(reports) : reports;

  return NextResponse.json({
    reports: filtered,
    summary: decaySummary(reports),
    total: reports.length,
    decaying: getDecayingDocs(reports).length,
  });
}
