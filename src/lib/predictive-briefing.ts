/**
 * Predictive briefings — context-aware, personalized workspace briefings.
 *
 * Combines signals from multiple sources to generate intelligent briefings:
 * - Calendar events → "Before your 2pm meeting, review these docs"
 * - Access patterns → "Docs you read frequently but haven't checked recently"
 * - Recent changes → "These high-impact docs changed since your last visit"
 * - Impact scores → prioritize by who needs to know
 *
 * Works with or without AI — heuristic briefings are always available,
 * AI enhances them with natural language summaries.
 */

import { getDb, getArtifactContent, searchArtifacts } from "./db";
import { ask, isAiConfigured } from "./ai-client";

// ── Types ──────────────────────────────────────────────────────────

export type BriefingPriority = "urgent" | "important" | "informational";

export interface BriefingItem {
  artifactPath: string;
  title: string;
  priority: BriefingPriority;
  reason: string;
  summary: string | null;
  lastAccessed: string | null;
  changedSince: string | null;
  relatedEvent: string | null;
}

export interface PredictiveBriefing {
  generatedAt: string;
  items: BriefingItem[];
  meetingContext: MeetingBriefingItem[];
  decayAlerts: DecayAlertItem[];
  aiNarrative: string | null;
  stats: BriefingStats;
}

export interface MeetingBriefingItem {
  eventTitle: string;
  eventTime: string;
  relatedDocs: Array<{ path: string; title: string; relevance: string }>;
}

export interface DecayAlertItem {
  artifactPath: string;
  title: string;
  lastAccessed: string;
  accessCount: number;
  reason: string;
}

export interface BriefingStats {
  totalItems: number;
  urgent: number;
  important: number;
  informational: number;
  meetingCount: number;
  decayAlerts: number;
}

// ── Access pattern analysis ───────────────────────────────────────

/**
 * Find docs the user reads frequently but hasn't checked recently.
 */
export function findStaleFrequentDocs(options?: { frequentDays?: number; staleDays?: number; minAccess?: number }): Array<{
  path: string; title: string; totalAccess: number; lastAccessed: string;
}> {
  const frequentDays = options?.frequentDays || 60;
  const staleDays = options?.staleDays || 7;
  const minAccess = options?.minAccess || 3;

  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT ao.path, a.title,
        COUNT(*) as total_access,
        MAX(ao.opened_at) as last_accessed
      FROM artifact_opens ao
      LEFT JOIN artifacts a ON a.path = ao.path
      WHERE ao.opened_at >= datetime('now', '-' || ? || ' days')
      GROUP BY ao.path
      HAVING total_access >= ?
        AND last_accessed < datetime('now', '-' || ? || ' days')
      ORDER BY total_access DESC
      LIMIT 20
    `).all(frequentDays, minAccess, staleDays) as Array<{
      path: string; title: string; total_access: number; last_accessed: string;
    }>;
    return rows.map((r) => ({
      path: r.path,
      title: r.title || r.path,
      totalAccess: r.total_access,
      lastAccessed: r.last_accessed,
    }));
  } catch {
    return [];
  }
}

/**
 * Find high-impact docs that changed recently.
 */
export function findRecentHighImpactChanges(days = 3): Array<{
  path: string; title: string; modifiedAt: string; impactSignal: string;
}> {
  const db = getDb();
  try {
    // Get recently modified artifacts
    const recent = db.prepare(`
      SELECT path, title, modified_at
      FROM artifacts
      WHERE modified_at >= datetime('now', '-' || ? || ' days')
      ORDER BY modified_at DESC
      LIMIT 50
    `).all(days) as Array<{ path: string; title: string; modified_at: string }>;

    const results: Array<{ path: string; title: string; modifiedAt: string; impactSignal: string }> = [];

    for (const doc of recent) {
      // Check if this doc has backlinks (other docs depend on it)
      let backlinkCount = 0;
      try {
        const row = db.prepare(
          "SELECT COUNT(*) as count FROM artifact_links WHERE target_path = ?",
        ).get(doc.path) as { count: number } | undefined;
        backlinkCount = row?.count || 0;
      } catch { /* table may not exist */ }

      // Check if this doc has annotations or reviews
      let interactionCount = 0;
      try {
        const annRow = db.prepare(
          "SELECT COUNT(*) as count FROM annotations WHERE artifact_path = ?",
        ).get(doc.path) as { count: number } | undefined;
        interactionCount += annRow?.count || 0;
      } catch { /* table may not exist */ }

      if (backlinkCount > 0 || interactionCount > 0) {
        const signals: string[] = [];
        if (backlinkCount > 0) signals.push(`${backlinkCount} docs depend on this`);
        if (interactionCount > 0) signals.push(`${interactionCount} interactions`);

        results.push({
          path: doc.path,
          title: doc.title || doc.path,
          modifiedAt: doc.modified_at,
          impactSignal: signals.join(", "),
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ── Meeting context ───────────────────────────────────────────────

/**
 * Match upcoming events to relevant artifacts.
 * Events are passed in (from calendar.ts), matching is done here.
 */
export function matchEventsToArtifacts(
  events: Array<{ title: string; startTime: string }>,
): MeetingBriefingItem[] {
  const results: MeetingBriefingItem[] = [];

  for (const event of events) {
    // Search for artifacts related to the event title
    const keywords = event.title
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (keywords.length === 0) continue;

    const relatedDocs: Array<{ path: string; title: string; relevance: string }> = [];

    // Search for each significant keyword
    const seen = new Set<string>();
    for (const keyword of keywords.slice(0, 3)) {
      try {
        const matches = searchArtifacts(keyword, 3);
        for (const m of matches) {
          if (!seen.has(m.path)) {
            seen.add(m.path);
            relatedDocs.push({
              path: m.path,
              title: m.title || m.path,
              relevance: `matches "${keyword}" from event title`,
            });
          }
        }
      } catch { /* search may fail */ }
    }

    if (relatedDocs.length > 0) {
      results.push({
        eventTitle: event.title,
        eventTime: event.startTime,
        relatedDocs: relatedDocs.slice(0, 5),
      });
    }
  }

  return results;
}

// ── Briefing generation ───────────────────────────────────────────

/**
 * Generate a predictive briefing combining all signals.
 */
export async function generateBriefing(options?: {
  events?: Array<{ title: string; startTime: string }>;
  useAI?: boolean;
  changeDays?: number;
}): Promise<PredictiveBriefing> {
  const changeDays = options?.changeDays || 3;
  const items: BriefingItem[] = [];

  // 1. Recently changed high-impact docs
  const highImpactChanges = findRecentHighImpactChanges(changeDays);
  for (const change of highImpactChanges) {
    items.push({
      artifactPath: change.path,
      title: change.title,
      priority: "urgent",
      reason: `Changed recently — ${change.impactSignal}`,
      summary: null,
      lastAccessed: null,
      changedSince: change.modifiedAt,
      relatedEvent: null,
    });
  }

  // 2. Stale frequent docs (you read these often but haven't recently)
  const staleFrequent = findStaleFrequentDocs();
  for (const doc of staleFrequent) {
    items.push({
      artifactPath: doc.path,
      title: doc.title,
      priority: "important",
      reason: `You accessed this ${doc.totalAccess} times but not in the last 7 days`,
      summary: null,
      lastAccessed: doc.lastAccessed,
      changedSince: null,
      relatedEvent: null,
    });
  }

  // 3. Meeting context
  const meetingContext = options?.events ? matchEventsToArtifacts(options.events) : [];
  for (const meeting of meetingContext) {
    for (const doc of meeting.relatedDocs) {
      // Avoid duplicates
      if (!items.some((i) => i.artifactPath === doc.path)) {
        items.push({
          artifactPath: doc.path,
          title: doc.title,
          priority: "important",
          reason: `Related to your meeting: "${meeting.eventTitle}"`,
          summary: null,
          lastAccessed: null,
          changedSince: null,
          relatedEvent: meeting.eventTitle,
        });
      }
    }
  }

  // 4. Decay alerts
  const decayAlerts = findStaleFrequentDocs({ staleDays: 14, minAccess: 5 }).map((d) => ({
    artifactPath: d.path,
    title: d.title,
    lastAccessed: d.lastAccessed,
    accessCount: d.totalAccess,
    reason: `Accessed ${d.totalAccess} times historically but not in 14+ days`,
  }));

  // Sort by priority
  const priorityOrder: Record<BriefingPriority, number> = { urgent: 0, important: 1, informational: 2 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Generate AI narrative if available
  let aiNarrative: string | null = null;
  if (options?.useAI && isAiConfigured() && items.length > 0) {
    aiNarrative = await generateAINarrative(items, meetingContext);
  }

  const stats: BriefingStats = {
    totalItems: items.length,
    urgent: items.filter((i) => i.priority === "urgent").length,
    important: items.filter((i) => i.priority === "important").length,
    informational: items.filter((i) => i.priority === "informational").length,
    meetingCount: meetingContext.length,
    decayAlerts: decayAlerts.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    items,
    meetingContext,
    decayAlerts,
    aiNarrative,
    stats,
  };
}

// ── AI narrative ──────────────────────────────────────────────────

async function generateAINarrative(
  items: BriefingItem[],
  meetings: MeetingBriefingItem[],
): Promise<string | null> {
  if (!isAiConfigured()) return null;

  const urgentItems = items.filter((i) => i.priority === "urgent");
  const importantItems = items.filter((i) => i.priority === "important");

  let context = "Generate a brief, actionable morning briefing (3-5 sentences) based on these signals:\n\n";

  if (urgentItems.length > 0) {
    context += "URGENT CHANGES:\n";
    for (const item of urgentItems.slice(0, 5)) {
      context += `- "${item.title}" — ${item.reason}\n`;
    }
  }

  if (importantItems.length > 0) {
    context += "\nIMPORTANT:\n";
    for (const item of importantItems.slice(0, 5)) {
      context += `- "${item.title}" — ${item.reason}\n`;
    }
  }

  if (meetings.length > 0) {
    context += "\nUPCOMING MEETINGS:\n";
    for (const m of meetings.slice(0, 3)) {
      context += `- ${m.eventTitle} at ${m.eventTime} (${m.relatedDocs.length} related docs)\n`;
    }
  }

  context += "\nWrite a concise, personalized briefing. Be specific about what to review and why.";

  try {
    const result = await ask(context, {
      systemPrompt: "You are a concise executive assistant. Generate actionable briefings, not summaries.",
      maxTokens: 300,
      cacheKey: `briefing:${new Date().toISOString().slice(0, 13)}`, // Cache per hour
      cacheTtl: 3600,
    });
    if (result.model === "none") return null;
    return result.content;
  } catch {
    return null;
  }
}

// ── Briefing summary helpers ──────────────────────────────────────

export function briefingToText(briefing: PredictiveBriefing): string {
  const lines: string[] = [];

  if (briefing.aiNarrative) {
    lines.push(briefing.aiNarrative);
    lines.push("");
  }

  if (briefing.items.length === 0 && briefing.meetingContext.length === 0 && briefing.decayAlerts.length === 0) {
    lines.push("No items require your attention right now.");
    return lines.join("\n");
  }

  const urgent = briefing.items.filter((i) => i.priority === "urgent");
  const important = briefing.items.filter((i) => i.priority === "important");

  if (urgent.length > 0) {
    lines.push(`🔴 ${urgent.length} urgent item${urgent.length > 1 ? "s" : ""}:`);
    for (const item of urgent) {
      lines.push(`  - ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }

  if (important.length > 0) {
    lines.push(`🟡 ${important.length} important item${important.length > 1 ? "s" : ""}:`);
    for (const item of important) {
      lines.push(`  - ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }

  if (briefing.meetingContext.length > 0) {
    lines.push(`📅 ${briefing.meetingContext.length} meeting${briefing.meetingContext.length > 1 ? "s" : ""} with related docs:`);
    for (const m of briefing.meetingContext) {
      lines.push(`  - ${m.eventTitle} (${m.relatedDocs.length} docs)`);
    }
    lines.push("");
  }

  if (briefing.decayAlerts.length > 0) {
    lines.push(`⚠️ ${briefing.decayAlerts.length} knowledge decay alert${briefing.decayAlerts.length > 1 ? "s" : ""}`);
  }

  return lines.join("\n").trim();
}

/**
 * Compute a briefing priority score (for sorting/ranking).
 */
export function computeBriefingScore(briefing: PredictiveBriefing): number {
  return (
    briefing.stats.urgent * 30 +
    briefing.stats.important * 15 +
    briefing.stats.informational * 5 +
    briefing.stats.meetingCount * 20 +
    briefing.stats.decayAlerts * 10
  );
}
