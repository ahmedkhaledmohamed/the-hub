import { NextRequest, NextResponse } from "next/server";
import { generateMeetingBriefing, generateDailyBriefings, formatDailyBriefings } from "@/lib/meeting-briefing";

export const dynamic = "force-dynamic";

/**
 * GET /api/meeting-brief?topic=<title>    — brief for a specific meeting
 * GET /api/meeting-brief?today=true       — briefs for all today's meetings
 * GET /api/meeting-brief?today=true&format=text — text format
 */
export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic");
  const today = req.nextUrl.searchParams.get("today");
  const format = req.nextUrl.searchParams.get("format");
  const changeDays = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);

  if (today === "true") {
    const report = await generateDailyBriefings();
    if (format === "text") {
      return new Response(formatDailyBriefings(report), { headers: { "Content-Type": "text/plain" } });
    }
    return NextResponse.json(report);
  }

  if (topic) {
    const briefing = generateMeetingBriefing(topic, new Date().toISOString(), { changeDays });
    if (format === "text") {
      return new Response(briefing.briefingText, { headers: { "Content-Type": "text/plain" } });
    }
    return NextResponse.json(briefing);
  }

  return NextResponse.json({ error: "Provide ?topic=<meeting title> or ?today=true" }, { status: 400 });
}
