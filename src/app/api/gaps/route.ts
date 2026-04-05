import { NextRequest, NextResponse } from "next/server";
import { detectGaps, formatGapReport } from "@/lib/knowledge-gaps";

export const dynamic = "force-dynamic";

/**
 * GET /api/gaps                — knowledge gap report
 * GET /api/gaps?format=text    — plain text format
 * GET /api/gaps?days=14        — custom lookback period
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);

  const report = detectGaps({ days });

  if (format === "text") {
    return new Response(formatGapReport(report), { headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json(report);
}
