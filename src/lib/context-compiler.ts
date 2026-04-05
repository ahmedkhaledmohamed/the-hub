/**
 * Auto-context compilation — generate context packets for meetings.
 *
 * Combines calendar events with related docs, recent decisions,
 * and changes since last meeting to produce a ready-to-use context
 * packet that AI agents can use to prepare for meetings.
 *
 * Example: "For your 2pm Architecture Review, here are the 5 docs
 * that changed, 2 new decisions, and 1 conflict to resolve."
 */

import { searchArtifacts, getArtifactContent, getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface ContextPacket {
  eventTitle: string;
  eventTime: string;
  relatedDocs: Array<{ path: string; title: string; snippet: string; relevance: string }>;
  recentDecisions: Array<{ summary: string; artifactPath: string; status: string; actor: string | null }>;
  recentChanges: Array<{ path: string; title: string; staleDays: number }>;
  conflicts: Array<{ description: string }>;
  summary: string;
  generatedAt: string;
}

// ── Context compilation ───────────────────────────────────────────

/**
 * Compile a context packet for a meeting/event.
 * Searches for related docs, decisions, and recent changes based on the event title.
 */
export function compileContext(eventTitle: string, eventTime: string, options?: {
  changeDays?: number;
  maxDocs?: number;
}): ContextPacket {
  const changeDays = options?.changeDays || 7;
  const maxDocs = options?.maxDocs || 10;

  // Extract keywords from event title
  const stopWords = new Set(["the", "a", "an", "and", "or", "for", "with", "meeting", "sync", "standup", "review", "weekly", "daily", "call"]);
  const keywords = eventTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Find related docs
  const relatedDocs: ContextPacket["relatedDocs"] = [];
  const seenPaths = new Set<string>();

  for (const keyword of keywords.slice(0, 5)) {
    try {
      const results = searchArtifacts(keyword, 5);
      for (const r of results) {
        if (!seenPaths.has(r.path)) {
          seenPaths.add(r.path);
          relatedDocs.push({
            path: r.path,
            title: r.title,
            snippet: r.snippet || "",
            relevance: `matches "${keyword}"`,
          });
        }
      }
    } catch { /* search may fail */ }
  }

  // Find recent decisions related to the event
  const recentDecisions: ContextPacket["recentDecisions"] = [];
  try {
    const { searchDecisions } = require("./decision-tracker");
    for (const keyword of keywords.slice(0, 3)) {
      const decisions = searchDecisions(keyword) as Array<{ summary: string; artifactPath: string; status: string; actor: string | null }>;
      for (const d of decisions.slice(0, 3)) {
        if (!recentDecisions.some((rd) => rd.summary === d.summary)) {
          recentDecisions.push({
            summary: d.summary,
            artifactPath: d.artifactPath,
            status: d.status,
            actor: d.actor,
          });
        }
      }
    }
  } catch { /* decision tracker may not be available */ }

  // Find recent changes in related docs
  const recentChanges: ContextPacket["recentChanges"] = [];
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT path, title, stale_days FROM artifacts WHERE stale_days <= ? ORDER BY stale_days ASC LIMIT ?",
    ).all(changeDays, 20) as Array<{ path: string; title: string; stale_days: number }>;

    // Filter to docs that are related (match any keyword or in related doc paths)
    for (const row of rows) {
      const titleLower = row.title.toLowerCase();
      const pathLower = row.path.toLowerCase();
      const isRelated = keywords.some((k) => titleLower.includes(k) || pathLower.includes(k))
        || seenPaths.has(row.path);

      if (isRelated) {
        recentChanges.push({ path: row.path, title: row.title, staleDays: row.stale_days });
      }
    }
  } catch { /* artifacts table may use different column name */ }

  // Check for conflicts among related decisions
  const conflicts: ContextPacket["conflicts"] = [];
  try {
    const { findContradictions } = require("./decision-tracker");
    const allContradictions = findContradictions() as Array<{ decisionA: { summary: string }; decisionB: { summary: string }; reason: string }>;
    const relatedPaths = new Set(relatedDocs.map((d) => d.path));
    for (const c of allContradictions) {
      // Check if contradiction involves related content
      const isRelevant = keywords.some((k) =>
        c.decisionA.summary.toLowerCase().includes(k) ||
        c.decisionB.summary.toLowerCase().includes(k),
      );
      if (isRelevant) {
        conflicts.push({ description: `"${c.decisionA.summary}" vs "${c.decisionB.summary}" — ${c.reason}` });
      }
    }
  } catch { /* non-critical */ }

  // Generate summary
  const parts: string[] = [];
  if (relatedDocs.length > 0) parts.push(`${relatedDocs.length} related doc(s)`);
  if (recentDecisions.length > 0) parts.push(`${recentDecisions.length} decision(s)`);
  if (recentChanges.length > 0) parts.push(`${recentChanges.length} recent change(s)`);
  if (conflicts.length > 0) parts.push(`${conflicts.length} conflict(s) to resolve`);

  const summary = parts.length > 0
    ? `For "${eventTitle}": ${parts.join(", ")}.`
    : `No context found for "${eventTitle}".`;

  return {
    eventTitle,
    eventTime,
    relatedDocs: relatedDocs.slice(0, maxDocs),
    recentDecisions: recentDecisions.slice(0, 5),
    recentChanges: recentChanges.slice(0, 10),
    conflicts: conflicts.slice(0, 5),
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Compile context packets for all today's events.
 */
export async function compileContextForToday(): Promise<ContextPacket[]> {
  try {
    const { fetchCalendarEvents, filterTodayEvents } = require("./calendar");
    const events = await fetchCalendarEvents();
    const todayEvents = filterTodayEvents(events);

    return todayEvents.map((event: { title: string; startTime: string }) =>
      compileContext(event.title, event.startTime),
    );
  } catch {
    return [];
  }
}

/**
 * Format a context packet as readable text (for MCP tool output).
 */
export function formatContextPacket(packet: ContextPacket): string {
  const lines: string[] = [];
  lines.push(`**Context for: ${packet.eventTitle}**`);
  lines.push(`Time: ${packet.eventTime}`);
  lines.push("");

  if (packet.relatedDocs.length > 0) {
    lines.push(`**Related Documents (${packet.relatedDocs.length}):**`);
    for (const doc of packet.relatedDocs) {
      lines.push(`- ${doc.title} (${doc.path}) — ${doc.relevance}`);
      if (doc.snippet) lines.push(`  ${doc.snippet.slice(0, 100)}`);
    }
    lines.push("");
  }

  if (packet.recentDecisions.length > 0) {
    lines.push(`**Recent Decisions (${packet.recentDecisions.length}):**`);
    for (const d of packet.recentDecisions) {
      lines.push(`- [${d.status}] ${d.summary}${d.actor ? ` (by ${d.actor})` : ""}`);
    }
    lines.push("");
  }

  if (packet.recentChanges.length > 0) {
    lines.push(`**Recent Changes (${packet.recentChanges.length}):**`);
    for (const c of packet.recentChanges) {
      lines.push(`- ${c.title} — modified ${c.staleDays === 0 ? "today" : `${c.staleDays}d ago`}`);
    }
    lines.push("");
  }

  if (packet.conflicts.length > 0) {
    lines.push(`**Conflicts to Resolve (${packet.conflicts.length}):**`);
    for (const c of packet.conflicts) {
      lines.push(`- ${c.description}`);
    }
    lines.push("");
  }

  if (packet.relatedDocs.length === 0 && packet.recentDecisions.length === 0) {
    lines.push("No specific context found. Consider adding relevant docs to your workspace.");
  }

  return lines.join("\n");
}
