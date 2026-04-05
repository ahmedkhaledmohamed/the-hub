/**
 * Agent session tracking — track what agents query and what changed since.
 *
 * Records every MCP tool invocation with session context, then provides
 * "catch up" summaries: "Since your last session, 3 docs changed,
 * 2 new decisions were made, and 1 doc you asked about was updated."
 *
 * This is the cross-session intelligence layer that stateless AI tools lack.
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface SessionEvent {
  id: number;
  sessionId: string;
  agentId: string;
  toolName: string;
  query: string;
  artifactPaths: string[];
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  agentId: string;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  toolsUsed: string[];
  artifactsAccessed: string[];
}

export interface CatchUpReport {
  sinceSession: string;
  sinceTime: string;
  changedArtifacts: Array<{ path: string; title: string; staleDays: number }>;
  newDecisions: Array<{ summary: string; artifactPath: string }>;
  queriedArtifactsChanged: Array<{ path: string; title: string; queriedAt: string }>;
  summary: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureSessionTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_session_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT NOT NULL,
      agent_id      TEXT NOT NULL DEFAULT 'mcp-client',
      tool_name     TEXT NOT NULL,
      query         TEXT NOT NULL DEFAULT '',
      artifact_paths TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_session_events_sid ON agent_session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_events_agent ON agent_session_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_session_events_time ON agent_session_events(created_at);
  `);
}

// ── Row mapping ───────────────────────────────────────────────────

function rowToEvent(row: Record<string, unknown>): SessionEvent {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    agentId: row.agent_id as string,
    toolName: row.tool_name as string,
    query: row.query as string,
    artifactPaths: JSON.parse((row.artifact_paths as string) || "[]"),
    createdAt: row.created_at as string,
  };
}

// ── Track ─────────────────────────────────────────────────────────

/**
 * Record a tool invocation in the session log.
 */
export function trackToolUse(opts: {
  sessionId: string;
  agentId?: string;
  toolName: string;
  query?: string;
  artifactPaths?: string[];
}): number {
  ensureSessionTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO agent_session_events (session_id, agent_id, tool_name, query, artifact_paths) VALUES (?, ?, ?, ?, ?)",
  ).run(
    opts.sessionId,
    opts.agentId || "mcp-client",
    opts.toolName,
    opts.query || "",
    JSON.stringify(opts.artifactPaths || []),
  );
  return result.lastInsertRowid as number;
}

// ── Query ─────────────────────────────────────────────────────────

/**
 * Get events for a session.
 */
export function getSessionEvents(sessionId: string, limit = 100): SessionEvent[] {
  ensureSessionTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM agent_session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
  ).all(sessionId, limit) as Array<Record<string, unknown>>).map(rowToEvent);
}

/**
 * Get a summary of a session.
 */
export function getSessionSummary(sessionId: string): SessionSummary | null {
  ensureSessionTable();
  const db = getDb();
  const events = getSessionEvents(sessionId);
  if (events.length === 0) return null;

  const tools = new Set<string>();
  const artifacts = new Set<string>();
  for (const e of events) {
    tools.add(e.toolName);
    for (const p of e.artifactPaths) artifacts.add(p);
  }

  return {
    sessionId,
    agentId: events[0].agentId,
    firstSeen: events[events.length - 1].createdAt,
    lastSeen: events[0].createdAt,
    eventCount: events.length,
    toolsUsed: Array.from(tools),
    artifactsAccessed: Array.from(artifacts),
  };
}

/**
 * Get the most recent sessions.
 */
export function getRecentSessions(limit = 10): Array<{ sessionId: string; agentId: string; eventCount: number; lastSeen: string }> {
  ensureSessionTable();
  const db = getDb();
  return db.prepare(`
    SELECT session_id, agent_id, COUNT(*) as event_count, MAX(created_at) as last_seen
    FROM agent_session_events
    GROUP BY session_id
    ORDER BY last_seen DESC
    LIMIT ?
  `).all(limit) as Array<{ sessionId: string; agentId: string; eventCount: number; lastSeen: string }>;
}

// ── Catch-up ──────────────────────────────────────────────────────

/**
 * Generate a "catch up" report: what changed since the agent's last session.
 * This is the core cross-session intelligence feature.
 */
export function generateCatchUp(sessionId: string): CatchUpReport {
  ensureSessionTable();
  const db = getDb();

  // Find when this session last was active
  const lastEvent = db.prepare(
    "SELECT MAX(created_at) as last_time FROM agent_session_events WHERE session_id = ?",
  ).get(sessionId) as { last_time: string | null } | undefined;

  const sinceTime = lastEvent?.last_time || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Find artifacts that changed since last session
  const changedArtifacts: CatchUpReport["changedArtifacts"] = [];
  try {
    const rows = db.prepare(`
      SELECT path, title, stale_days FROM artifacts
      WHERE modified_at > ? OR stale_days = 0
      ORDER BY stale_days ASC
      LIMIT 20
    `).all(sinceTime) as Array<{ path: string; title: string; stale_days: number }>;
    for (const r of rows) {
      changedArtifacts.push({ path: r.path, title: r.title, staleDays: r.stale_days });
    }
  } catch { /* artifacts table may use different column */ }

  // Find new decisions since last session
  const newDecisions: CatchUpReport["newDecisions"] = [];
  try {
    const rows = db.prepare(`
      SELECT summary, artifact_path FROM decisions
      WHERE extracted_at > ? AND status = 'active'
      ORDER BY extracted_at DESC
      LIMIT 10
    `).all(sinceTime) as Array<{ summary: string; artifact_path: string }>;
    for (const r of rows) {
      newDecisions.push({ summary: r.summary, artifactPath: r.artifact_path });
    }
  } catch { /* decisions table may not exist */ }

  // Find artifacts the agent previously queried that have since changed
  const queriedArtifactsChanged: CatchUpReport["queriedArtifactsChanged"] = [];
  try {
    const queriedPaths = db.prepare(`
      SELECT DISTINCT json_each.value as path, MAX(e.created_at) as queried_at
      FROM agent_session_events e, json_each(e.artifact_paths)
      WHERE e.session_id = ?
      GROUP BY json_each.value
    `).all(sessionId) as Array<{ path: string; queried_at: string }>;

    for (const q of queriedPaths) {
      // Check if this artifact changed since it was queried
      const artifact = db.prepare(
        "SELECT path, title FROM artifacts WHERE path = ? AND (modified_at > ? OR stale_days = 0)",
      ).get(q.path, q.queried_at) as { path: string; title: string } | undefined;

      if (artifact) {
        queriedArtifactsChanged.push({
          path: artifact.path,
          title: artifact.title,
          queriedAt: q.queried_at,
        });
      }
    }
  } catch { /* json_each may not work on all SQLite versions */ }

  // Generate summary
  const parts: string[] = [];
  if (changedArtifacts.length > 0) parts.push(`${changedArtifacts.length} artifact(s) changed`);
  if (newDecisions.length > 0) parts.push(`${newDecisions.length} new decision(s)`);
  if (queriedArtifactsChanged.length > 0) parts.push(`${queriedArtifactsChanged.length} artifact(s) you previously queried were updated`);

  const summary = parts.length > 0
    ? `Since your last session: ${parts.join(", ")}.`
    : "Nothing significant changed since your last session.";

  return {
    sinceSession: sessionId,
    sinceTime,
    changedArtifacts,
    newDecisions,
    queriedArtifactsChanged,
    summary,
  };
}

/**
 * Format catch-up report as text (for MCP tool output).
 */
export function formatCatchUp(report: CatchUpReport): string {
  const lines: string[] = [];
  lines.push(`**Catch-up Report** (since ${report.sinceTime.slice(0, 16)})`);
  lines.push(report.summary);
  lines.push("");

  if (report.queriedArtifactsChanged.length > 0) {
    lines.push("**Docs you asked about that changed:**");
    for (const a of report.queriedArtifactsChanged) {
      lines.push(`- ${a.title} (${a.path}) — you queried at ${a.queriedAt.slice(0, 16)}`);
    }
    lines.push("");
  }

  if (report.newDecisions.length > 0) {
    lines.push(`**New decisions (${report.newDecisions.length}):**`);
    for (const d of report.newDecisions) {
      lines.push(`- ${d.summary} (${d.artifactPath})`);
    }
    lines.push("");
  }

  if (report.changedArtifacts.length > 0) {
    lines.push(`**Changed artifacts (${report.changedArtifacts.length}):**`);
    for (const a of report.changedArtifacts.slice(0, 10)) {
      lines.push(`- ${a.title} (${a.path}) — ${a.staleDays === 0 ? "today" : `${a.staleDays}d ago`}`);
    }
    if (report.changedArtifacts.length > 10) lines.push(`  ... and ${report.changedArtifacts.length - 10} more`);
  }

  return lines.join("\n");
}
