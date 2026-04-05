import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyDigest, formatDigestText, postWeeklyDigest } from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";

/**
 * GET /api/digest              — generate weekly digest
 * GET /api/digest?format=text  — plain text format
 * GET /api/digest?days=14      — custom lookback
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);

  const digest = generateWeeklyDigest(days);

  if (format === "text") {
    return new Response(formatDigestText(digest), { headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json(digest);
}

/**
 * POST /api/digest
 * { action: "post-slack", days?: number }  — generate and post to Slack
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action === "post-slack") {
    const days = (body.days as number) || 7;
    const result = await postWeeklyDigest(days);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be post-slack" }, { status: 400 });
}
