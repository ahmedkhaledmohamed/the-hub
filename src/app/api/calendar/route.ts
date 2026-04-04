import { NextResponse } from "next/server";
import {
  fetchCalendarEvents,
  filterTodayEvents,
  linkRelatedArtifacts,
  isCalendarConfigured,
} from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar — today's events with related artifacts
 */
export async function GET() {
  if (!isCalendarConfigured()) {
    return NextResponse.json({
      configured: false,
      events: [],
      message: "Set CALENDAR_URL in .env.local to enable calendar integration.",
    });
  }

  const allEvents = await fetchCalendarEvents();
  const todayEvents = filterTodayEvents(allEvents);
  const withArtifacts = linkRelatedArtifacts(todayEvents);

  return NextResponse.json({
    configured: true,
    events: withArtifacts,
    totalEvents: allEvents.length,
    todayCount: todayEvents.length,
  });
}
