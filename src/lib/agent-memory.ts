/**
 * Agent memory — persistent cross-session knowledge for AI agents.
 *
 * AI coding assistants (Claude Code, Cursor, ChatGPT) are stateless —
 * they reset every session. This module gives them a persistent memory
 * layer: agents write observations, insights, and decisions that persist
 * across sessions and can be recalled later.
 *
 * Usage via MCP tools:
 *   remember({ content, type, artifactPath? })  — write an observation
 *   recall({ query?, type?, sessionId? })        — read past observations
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type ObservationType = "observation" | "question" | "insight" | "decision" | "context";

export interface AgentObservation {
  id: number;
  agentId: string;
  sessionId: string;
  content: string;
  type: ObservationType;
  artifactPath: string | null;
  confidence: number;
  createdAt: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureMemoryTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_observations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id      TEXT NOT NULL DEFAULT 'unknown',
      session_id    TEXT NOT NULL DEFAULT 'default',
      content       TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'observation',
      artifact_path TEXT,
      confidence    REAL NOT NULL DEFAULT 1.0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_obs_agent ON agent_observations(agent_id);
    CREATE INDEX IF NOT EXISTS idx_obs_session ON agent_observations(session_id);
    CREATE INDEX IF NOT EXISTS idx_obs_type ON agent_observations(type);
    CREATE INDEX IF NOT EXISTS idx_obs_artifact ON agent_observations(artifact_path);
  `);
}

// ── Row mapping ───────────────────────────────────────────────────

function rowToObservation(row: Record<string, unknown>): AgentObservation {
  return {
    id: row.id as number,
    agentId: row.agent_id as string,
    sessionId: row.session_id as string,
    content: row.content as string,
    type: row.type as ObservationType,
    artifactPath: row.artifact_path as string | null,
    confidence: row.confidence as number,
    createdAt: row.created_at as string,
  };
}

// ── Write ─────────────────────────────────────────────────────────

/**
 * Store an agent observation.
 */
export function remember(opts: {
  agentId?: string;
  sessionId?: string;
  content: string;
  type?: ObservationType;
  artifactPath?: string;
  confidence?: number;
}): number {
  ensureMemoryTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO agent_observations (agent_id, session_id, content, type, artifact_path, confidence) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    opts.agentId || "unknown",
    opts.sessionId || "default",
    opts.content,
    opts.type || "observation",
    opts.artifactPath || null,
    opts.confidence ?? 1.0,
  );
  return result.lastInsertRowid as number;
}

// ── Read ──────────────────────────────────────────────────────────

/**
 * Recall observations matching the given criteria.
 */
export function recall(opts?: {
  agentId?: string;
  sessionId?: string;
  type?: ObservationType;
  artifactPath?: string;
  search?: string;
  limit?: number;
  days?: number;
}): AgentObservation[] {
  ensureMemoryTable();
  const db = getDb();
  const limit = opts?.limit || 50;

  let sql = "SELECT * FROM agent_observations WHERE 1=1";
  const params: unknown[] = [];

  if (opts?.agentId) {
    sql += " AND agent_id = ?";
    params.push(opts.agentId);
  }
  if (opts?.sessionId) {
    sql += " AND session_id = ?";
    params.push(opts.sessionId);
  }
  if (opts?.type) {
    sql += " AND type = ?";
    params.push(opts.type);
  }
  if (opts?.artifactPath) {
    sql += " AND artifact_path = ?";
    params.push(opts.artifactPath);
  }
  if (opts?.search) {
    sql += " AND content LIKE ?";
    params.push(`%${opts.search}%`);
  }
  if (opts?.days) {
    sql += " AND created_at >= datetime('now', '-' || ? || ' days')";
    params.push(opts.days);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(rowToObservation);
}

/**
 * Get a single observation by ID.
 */
export function getObservation(id: number): AgentObservation | null {
  ensureMemoryTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM agent_observations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToObservation(row) : null;
}

/**
 * Get observation counts by type.
 */
export function getObservationCounts(): Record<string, number> {
  ensureMemoryTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT type, COUNT(*) as count FROM agent_observations GROUP BY type",
  ).all() as Array<{ type: string; count: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.type] = r.count;
  return counts;
}

/**
 * Get unique agent IDs that have written observations.
 */
export function getKnownAgents(): Array<{ agentId: string; observationCount: number; lastSeen: string }> {
  ensureMemoryTable();
  const db = getDb();
  return db.prepare(
    "SELECT agent_id, COUNT(*) as count, MAX(created_at) as last_seen FROM agent_observations GROUP BY agent_id ORDER BY last_seen DESC",
  ).all() as Array<{ agentId: string; observationCount: number; lastSeen: string }>;
}

/**
 * Get unique session IDs for an agent.
 */
export function getAgentSessions(agentId: string, limit = 20): Array<{ sessionId: string; count: number; firstSeen: string; lastSeen: string }> {
  ensureMemoryTable();
  const db = getDb();
  return (db.prepare(
    "SELECT session_id, COUNT(*) as count, MIN(created_at) as first_seen, MAX(created_at) as last_seen FROM agent_observations WHERE agent_id = ? GROUP BY session_id ORDER BY last_seen DESC LIMIT ?",
  ).all(agentId, limit) as Array<Record<string, unknown>>).map((r) => ({
    sessionId: r.session_id as string,
    count: r.count as number,
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
  }));
}

/**
 * Delete an observation.
 */
export function forgetObservation(id: number): boolean {
  ensureMemoryTable();
  const db = getDb();
  const result = db.prepare("DELETE FROM agent_observations WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Delete all observations for a session.
 */
export function forgetSession(sessionId: string): number {
  ensureMemoryTable();
  const db = getDb();
  const result = db.prepare("DELETE FROM agent_observations WHERE session_id = ?").run(sessionId);
  return result.changes;
}

/**
 * Prune old observations (default: older than 90 days).
 */
export function pruneMemory(olderThanDays = 90): number {
  ensureMemoryTable();
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM agent_observations WHERE created_at < datetime('now', '-' || ? || ' days')",
  ).run(olderThanDays);
  return result.changes;
}
