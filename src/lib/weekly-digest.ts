/**
 * Weekly digest — auto-generated summary of workspace activity.
 *
 * Aggregates: changes, decisions, stale docs, knowledge gaps,
 * and hygiene findings into a structured digest that can be
 * posted to Slack or displayed in the briefing.
 */

import { getDb, getArtifactCount } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface WeeklyDigest {
  period: { start: string; end: string };
  changes: {
    added: number;
    modified: number;
    deleted: number;
    topChanged: Array<{ path: string; title: string }>;
  };
  decisions: {
    new: number;
    superseded: number;
    reverted: number;
    recent: Array<{ summary: string; artifactPath: string }>;
  };
  stale: {
    count: number;
    critical: Array<{ path: string; title: string; staleDays: number }>;
  };
  gaps: {
    count: number;
    topics: string[];
  };
  stats: {
    totalArtifacts: number;
    searchCount: number;
    agentQueries: number;
  };
  generatedAt: string;
}

// ── Generation ────────────────────────────────────────────────────

/**
 * Generate a weekly digest of workspace activity.
 */
export function generateWeeklyDigest(days = 7): WeeklyDigest {
  const db = getDb();
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  // Changes
  let added = 0, modified = 0, deleted = 0;
  const topChanged: Array<{ path: string; title: string }> = [];
  try {
    const recentRows = db.prepare(
      "SELECT path, title FROM artifacts WHERE stale_days <= ? ORDER BY stale_days ASC LIMIT 10",
    ).all(days) as Array<{ path: string; title: string }>;
    modified = recentRows.length;
    topChanged.push(...recentRows.slice(0, 5));
  } catch { /* table may use different column */ }

  // Decisions
  let newDecisions = 0, superseded = 0, reverted = 0;
  const recentDecisions: Array<{ summary: string; artifactPath: string }> = [];
  try {
    const decRows = db.prepare(
      "SELECT summary, artifact_path, status FROM decisions WHERE extracted_at >= datetime('now', '-' || ? || ' days')",
    ).all(days) as Array<{ summary: string; artifact_path: string; status: string }>;
    for (const r of decRows) {
      if (r.status === "active") { newDecisions++; recentDecisions.push({ summary: r.summary, artifactPath: r.artifact_path }); }
      if (r.status === "superseded") superseded++;
      if (r.status === "reverted") reverted++;
    }
  } catch { /* decisions table may not exist */ }

  // Stale docs
  let staleCount = 0;
  const criticalStale: Array<{ path: string; title: string; staleDays: number }> = [];
  try {
    const staleRows = db.prepare(
      "SELECT path, title, stale_days FROM artifacts WHERE stale_days > 30 ORDER BY stale_days DESC LIMIT 20",
    ).all() as Array<{ path: string; title: string; stale_days: number }>;
    staleCount = staleRows.length;
    criticalStale.push(...staleRows.slice(0, 5).map((r) => ({ path: r.path, title: r.title, staleDays: r.stale_days })));
  } catch { /* non-critical */ }

  // Knowledge gaps
  let gapCount = 0;
  const gapTopics: string[] = [];
  try {
    const gapRows = db.prepare(
      "SELECT query, COUNT(*) as cnt FROM search_queries WHERE result_count = 0 AND searched_at >= datetime('now', '-' || ? || ' days') GROUP BY LOWER(query) HAVING cnt >= 2 ORDER BY cnt DESC LIMIT 5",
    ).all(days) as Array<{ query: string; cnt: number }>;
    gapCount = gapRows.length;
    gapTopics.push(...gapRows.map((r) => r.query));
  } catch { /* non-critical */ }

  // Stats
  let searchCount = 0;
  try {
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM search_queries WHERE searched_at >= datetime('now', '-' || ? || ' days')",
    ).get(days) as { count: number } | undefined;
    searchCount = row?.count || 0;
  } catch { /* non-critical */ }

  let agentQueries = 0;
  try {
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM agent_session_events WHERE created_at >= datetime('now', '-' || ? || ' days')",
    ).get(days) as { count: number } | undefined;
    agentQueries = row?.count || 0;
  } catch { /* non-critical */ }

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    changes: { added, modified, deleted, topChanged },
    decisions: { new: newDecisions, superseded, reverted, recent: recentDecisions.slice(0, 5) },
    stale: { count: staleCount, critical: criticalStale },
    gaps: { count: gapCount, topics: gapTopics },
    stats: { totalArtifacts: getArtifactCount(), searchCount, agentQueries },
    generatedAt: new Date().toISOString(),
  };
}

// ── Formatting ────────────────────────────────────────────────────

/**
 * Format digest as plain text.
 */
export function formatDigestText(digest: WeeklyDigest): string {
  const lines: string[] = [];
  lines.push(`📋 Weekly Digest (${digest.period.start.slice(0, 10)} → ${digest.period.end.slice(0, 10)})`);
  lines.push("");

  // Changes
  lines.push(`📝 Changes: ${digest.changes.modified} modified`);
  if (digest.changes.topChanged.length > 0) {
    for (const c of digest.changes.topChanged.slice(0, 3)) {
      lines.push(`  • ${c.title}`);
    }
  }

  // Decisions
  if (digest.decisions.new > 0 || digest.decisions.superseded > 0) {
    lines.push("");
    lines.push(`🔀 Decisions: ${digest.decisions.new} new, ${digest.decisions.superseded} superseded, ${digest.decisions.reverted} reverted`);
    for (const d of digest.decisions.recent.slice(0, 3)) {
      lines.push(`  • ${d.summary}`);
    }
  }

  // Stale
  if (digest.stale.count > 0) {
    lines.push("");
    lines.push(`⚠️ Stale: ${digest.stale.count} docs older than 30 days`);
    for (const s of digest.stale.critical.slice(0, 3)) {
      lines.push(`  • ${s.title} (${s.staleDays}d)`);
    }
  }

  // Gaps
  if (digest.gaps.count > 0) {
    lines.push("");
    lines.push(`❓ Knowledge gaps: ${digest.gaps.count} topics searched with no results`);
    for (const g of digest.gaps.topics.slice(0, 3)) {
      lines.push(`  • "${g}"`);
    }
  }

  // Stats
  lines.push("");
  lines.push(`📊 ${digest.stats.totalArtifacts} artifacts | ${digest.stats.searchCount} searches | ${digest.stats.agentQueries} agent queries`);

  return lines.join("\n");
}

/**
 * Format digest as Slack blocks.
 */
export function formatDigestSlack(digest: WeeklyDigest): { text: string; blocks: Array<Record<string, unknown>> } {
  const blocks: Array<Record<string, unknown>> = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `📋 Weekly Digest (${digest.period.start.slice(0, 10)} → ${digest.period.end.slice(0, 10)})` },
  });

  // Changes section
  const changeParts: string[] = [`*${digest.changes.modified} docs modified*`];
  if (digest.changes.topChanged.length > 0) {
    changeParts.push(digest.changes.topChanged.slice(0, 3).map((c) => `• ${c.title}`).join("\n"));
  }
  blocks.push({ type: "section", text: { type: "mrkdwn", text: changeParts.join("\n") } });

  // Decisions section
  if (digest.decisions.new > 0) {
    const decParts = [`*${digest.decisions.new} new decision(s)*`];
    for (const d of digest.decisions.recent.slice(0, 3)) {
      decParts.push(`• ${d.summary}`);
    }
    blocks.push({ type: "section", text: { type: "mrkdwn", text: decParts.join("\n") } });
  }

  // Stale alert
  if (digest.stale.count > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `⚠️ *${digest.stale.count} stale docs* (30+ days old)` },
    });
  }

  // Stats footer
  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `${digest.stats.totalArtifacts} artifacts | ${digest.stats.searchCount} searches | ${digest.stats.agentQueries} agent queries`,
    }],
  });

  return {
    text: formatDigestText(digest),
    blocks,
  };
}

/**
 * Generate and post a weekly digest to Slack.
 */
export async function postWeeklyDigest(days = 7): Promise<{ sent: boolean; digest: WeeklyDigest }> {
  const digest = generateWeeklyDigest(days);

  try {
    const { isSlackConfigured, postToSlack } = require("./slack");
    if (!isSlackConfigured()) {
      return { sent: false, digest };
    }
    const message = formatDigestSlack(digest);
    const sent = await postToSlack(message);
    return { sent, digest };
  } catch {
    return { sent: false, digest };
  }
}
