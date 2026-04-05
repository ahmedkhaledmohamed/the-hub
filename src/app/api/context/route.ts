import { NextRequest, NextResponse } from "next/server";
import { compileContext, compileContextForToday, formatContextPacket } from "@/lib/context-compiler";

export const dynamic = "force-dynamic";

/**
 * GET /api/context?topic=<meeting title>   — compile context for a topic
 * GET /api/context?today=true              — compile for all today's events
 * GET /api/context?topic=X&format=text     — plain text format
 */
export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic");
  const today = req.nextUrl.searchParams.get("today");
  const format = req.nextUrl.searchParams.get("format");
  const changeDays = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);

  if (today === "true") {
    const packets = await compileContextForToday();
    if (format === "text") {
      const text = packets.map(formatContextPacket).join("\n\n---\n\n");
      return new Response(text || "No events today.", { headers: { "Content-Type": "text/plain" } });
    }
    return NextResponse.json({ packets, count: packets.length });
  }

  if (topic) {
    const packet = compileContext(topic, new Date().toISOString(), { changeDays });
    if (format === "text") {
      return new Response(formatContextPacket(packet), { headers: { "Content-Type": "text/plain" } });
    }
    return NextResponse.json(packet);
  }

  return NextResponse.json({ error: "Provide ?topic=<meeting title> or ?today=true" }, { status: 400 });
}
