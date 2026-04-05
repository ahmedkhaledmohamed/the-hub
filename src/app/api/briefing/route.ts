import { NextRequest, NextResponse } from "next/server";
import {
  generateBriefing,
  briefingToText,
  computeBriefingScore,
} from "@/lib/predictive-briefing";

export const dynamic = "force-dynamic";

/**
 * GET /api/briefing              — generate a predictive briefing
 * GET /api/briefing?format=text  — plain text version
 * GET /api/briefing?ai=true      — include AI narrative
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  const useAI = req.nextUrl.searchParams.get("ai") === "true";
  const days = parseInt(req.nextUrl.searchParams.get("days") || "3", 10);

  const briefing = await generateBriefing({ useAI, changeDays: days });

  if (format === "text") {
    return new Response(briefingToText(briefing), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({
    ...briefing,
    score: computeBriefingScore(briefing),
  });
}

/**
 * POST /api/briefing
 * { events?: [{ title, startTime }], useAI?: boolean, changeDays?: number }
 *
 * Allows passing calendar events for meeting-aware briefings.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const events = body.events as Array<{ title: string; startTime: string }> | undefined;
  const useAI = body.useAI as boolean | undefined;
  const changeDays = body.changeDays as number | undefined;

  const briefing = await generateBriefing({ events, useAI, changeDays });

  return NextResponse.json({
    ...briefing,
    score: computeBriefingScore(briefing),
  });
}
