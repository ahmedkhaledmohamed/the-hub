/**
 * Calendar integration — read-only meeting context for briefings.
 *
 * Supports iCal URL feeds (Google Calendar, Outlook, etc.).
 * Fetches events, parses them, and surfaces today's meetings
 * on the briefing page with auto-linked relevant artifacts.
 *
 * Configuration:
 *   CALENDAR_URL — iCal feed URL (.ics)
 *   Or via hub.config.ts: calendar.url
 */

import { getDb } from "./db";
import { searchArtifacts } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
  attendees: string[];
  relatedArtifacts: Array<{ path: string; title: string }>;
}

// ── iCal parsing (minimal, no external deps) ──────────────────────

function parseICalDate(value: string): string {
  // Handle DTSTART:20260404T140000Z or DTSTART;TZID=...:20260404T140000
  const dateStr = value.split(":").pop() || value;
  const clean = dateStr.replace(/[TZ]/g, (m) => m === "T" ? "T" : "");

  if (clean.length >= 15) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const h = clean.slice(9, 11) || "00";
    const min = clean.slice(11, 13) || "00";
    return `${y}-${m}-${d}T${h}:${min}:00`;
  }

  if (clean.length >= 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00`;
  }

  return value;
}

export function parseICal(icalText: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const blocks = icalText.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const lines = block.split(/\r?\n/);

    const props: Record<string, string> = {};
    let currentKey = "";

    for (const line of lines) {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        // Continuation line
        props[currentKey] = (props[currentKey] || "") + line.trim();
        continue;
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      let key = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1).trim();

      // Strip parameters (e.g., DTSTART;TZID=America/Toronto)
      if (key.includes(";")) key = key.split(";")[0];

      currentKey = key;
      props[key] = value;
    }

    const uid = props.UID || `event-${i}`;
    const summary = props.SUMMARY || "Untitled Event";
    const dtstart = props.DTSTART ? parseICalDate(`DTSTART:${props.DTSTART}`) : "";
    const dtend = props.DTEND ? parseICalDate(`DTEND:${props.DTEND}`) : dtstart;
    const description = (props.DESCRIPTION || "").replace(/\\n/g, "\n").replace(/\\,/g, ",");
    const location = (props.LOCATION || "").replace(/\\,/g, ",");

    // Parse attendees
    const attendees: string[] = [];
    for (const [k, v] of Object.entries(props)) {
      if (k === "ATTENDEE" && v.includes("mailto:")) {
        attendees.push(v.replace(/.*mailto:/i, ""));
      }
    }

    events.push({
      id: uid,
      title: summary,
      start: dtstart,
      end: dtend,
      description,
      location,
      attendees,
      relatedArtifacts: [],
    });
  }

  return events;
}

// ── Fetch events ───────────────────────────────────────────────────

const eventCache = new Map<string, { events: CalendarEvent[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function fetchCalendarEvents(calendarUrl?: string): Promise<CalendarEvent[]> {
  const url = calendarUrl || process.env.CALENDAR_URL;
  if (!url) return [];

  // Check cache
  const cached = eventCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.events;
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "text/calendar" },
    });

    if (!res.ok) return [];

    const text = await res.text();
    const events = parseICal(text);

    eventCache.set(url, { events, fetchedAt: Date.now() });
    return events;
  } catch {
    return cached?.events || [];
  }
}

// ── Today's events ─────────────────────────────────────────────────

export function filterTodayEvents(events: CalendarEvent[]): CalendarEvent[] {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return events.filter((e) => e.start.startsWith(today));
}

// ── Auto-link related artifacts ────────────────────────────────────

export function linkRelatedArtifacts(events: CalendarEvent[]): CalendarEvent[] {
  return events.map((event) => {
    // Search for artifacts matching the event title
    const titleWords = event.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (titleWords.length === 0) return event;

    const query = titleWords.slice(0, 3).join(" ");
    try {
      const results = searchArtifacts(query, 3);
      return {
        ...event,
        relatedArtifacts: results.map((r) => ({ path: r.path, title: r.title })),
      };
    } catch {
      return event;
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────

export function isCalendarConfigured(): boolean {
  return !!process.env.CALENDAR_URL;
}

export function clearCalendarCache(): void {
  eventCache.clear();
}
