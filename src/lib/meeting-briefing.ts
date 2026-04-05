/**
 * Calendar-aware pre-meeting briefings.
 *
 * Generates actionable briefings before meetings by combining:
 * - Calendar events (from iCal feed)
 * - Context compilation (related docs, decisions, changes)
 * - Notifications ("review these before your 2pm")
 * - Smart summaries of what changed since last meeting
 *
 * Flow: calendar → compile context per event → enrich with decisions →
 *       generate briefing → notify via SSE/Slack
 */

import { compileContext, formatContextPacket } from "./context-compiler";
import type { ContextPacket } from "./context-compiler";

// ── Types ──────────────────────────────────────────────────────────

export interface MeetingBriefing {
  eventTitle: string;
  eventTime: string;
  minutesUntil: number;
  context: ContextPacket;
  actionItems: string[];
  priority: "high" | "medium" | "low";
  briefingText: string;
  generatedAt: string;
}

export interface DailyBriefingReport {
  date: string;
  meetings: MeetingBriefing[];
  totalMeetings: number;
  highPriority: number;
  generatedAt: string;
}

// ── Generation ────────────────────────────────────────────────────

/**
 * Generate a pre-meeting briefing for a single event.
 */
export function generateMeetingBriefing(
  eventTitle: string,
  eventTime: string,
  options?: { changeDays?: number },
): MeetingBriefing {
  const changeDays = options?.changeDays || 7;

  // Compile context
  const context = compileContext(eventTitle, eventTime, { changeDays });

  // Compute minutes until meeting
  const eventDate = new Date(eventTime);
  const now = new Date();
  const minutesUntil = Math.round((eventDate.getTime() - now.getTime()) / 60000);

  // Determine priority based on context richness
  const totalSignals = context.relatedDocs.length + context.recentDecisions.length +
    context.recentChanges.length + context.conflicts.length;
  const priority: MeetingBriefing["priority"] =
    context.conflicts.length > 0 || totalSignals >= 8 ? "high" :
    totalSignals >= 3 ? "medium" : "low";

  // Generate action items
  const actionItems = generateActionItems(context, minutesUntil);

  // Generate briefing text
  const briefingText = formatMeetingBriefing(eventTitle, eventTime, context, actionItems, minutesUntil);

  return {
    eventTitle,
    eventTime,
    minutesUntil,
    context,
    actionItems,
    priority,
    briefingText,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate briefings for all today's events.
 */
export async function generateDailyBriefings(): Promise<DailyBriefingReport> {
  const briefings: MeetingBriefing[] = [];

  try {
    const { fetchCalendarEvents, filterTodayEvents } = require("./calendar");
    const events = await fetchCalendarEvents();
    const todayEvents = filterTodayEvents(events);

    for (const event of todayEvents) {
      const briefing = generateMeetingBriefing(event.title, event.startTime);
      briefings.push(briefing);
    }
  } catch { /* calendar not configured */ }

  // Sort by event time
  briefings.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

  return {
    date: new Date().toISOString().slice(0, 10),
    meetings: briefings,
    totalMeetings: briefings.length,
    highPriority: briefings.filter((b) => b.priority === "high").length,
    generatedAt: new Date().toISOString(),
  };
}

// ── Action items ──────────────────────────────────────────────────

function generateActionItems(context: ContextPacket, minutesUntil: number): string[] {
  const items: string[] = [];

  // Conflicts need resolution before meeting
  if (context.conflicts.length > 0) {
    items.push(`Resolve ${context.conflicts.length} conflict(s) before the meeting`);
  }

  // Recently changed docs should be reviewed
  if (context.recentChanges.length > 0) {
    const docList = context.recentChanges.slice(0, 3).map((c) => c.title).join(", ");
    items.push(`Review recent changes: ${docList}`);
  }

  // New decisions to be aware of
  if (context.recentDecisions.length > 0) {
    items.push(`${context.recentDecisions.length} recent decision(s) to be aware of`);
  }

  // Time-sensitive advice
  if (minutesUntil > 0 && minutesUntil <= 30) {
    items.push("Meeting starts soon — do a quick scan of related docs");
  } else if (minutesUntil > 30 && minutesUntil <= 120) {
    items.push("Time to review the key docs before the meeting");
  }

  return items;
}

// ── Formatting ────────────────────────────────────────────────────

function formatMeetingBriefing(
  eventTitle: string,
  eventTime: string,
  context: ContextPacket,
  actionItems: string[],
  minutesUntil: number,
): string {
  const lines: string[] = [];
  const timeLabel = minutesUntil > 0 ? `in ${minutesUntil} minutes` : "now";

  lines.push(`📅 **Pre-Meeting Briefing: ${eventTitle}** (${timeLabel})`);
  lines.push("");

  // Action items first (most important)
  if (actionItems.length > 0) {
    lines.push("**Action items:**");
    for (const item of actionItems) {
      lines.push(`  ☐ ${item}`);
    }
    lines.push("");
  }

  // Context packet
  lines.push(formatContextPacket(context));

  return lines.join("\n");
}

/**
 * Format the daily report as text.
 */
export function formatDailyBriefings(report: DailyBriefingReport): string {
  if (report.meetings.length === 0) {
    return "No meetings today. Clear calendar day.";
  }

  const lines: string[] = [];
  lines.push(`📅 **Daily Meeting Briefings** (${report.date})`);
  lines.push(`${report.totalMeetings} meeting(s), ${report.highPriority} high priority`);
  lines.push("");

  for (const meeting of report.meetings) {
    lines.push(meeting.briefingText);
    lines.push("\n---\n");
  }

  return lines.join("\n");
}
