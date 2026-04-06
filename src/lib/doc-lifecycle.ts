/**
 * Document lifecycle states — formal state tracking for artifacts.
 *
 * States: draft → active → stale → archived
 *
 * Transitions can be:
 * - Manual: user explicitly changes state
 * - Automatic: based on staleness thresholds or review completion
 *
 * Each transition is logged with timestamp and reason.
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type LifecycleState = "draft" | "active" | "stale" | "archived";

export interface LifecycleRecord {
  path: string;
  state: LifecycleState;
  previousState: LifecycleState | null;
  changedAt: string;
  changedBy: string;
  reason: string;
}

export interface LifecycleTransition {
  from: LifecycleState;
  to: LifecycleState;
  path: string;
  changedBy: string;
  reason: string;
  timestamp: string;
}

export interface LifecycleSummary {
  draft: number;
  active: number;
  stale: number;
  archived: number;
  total: number;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS doc_lifecycle (
      path         TEXT PRIMARY KEY,
      state        TEXT NOT NULL DEFAULT 'active',
      previous_state TEXT,
      changed_at   TEXT NOT NULL DEFAULT (datetime('now')),
      changed_by   TEXT NOT NULL DEFAULT 'system',
      reason       TEXT NOT NULL DEFAULT 'initial'
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_state ON doc_lifecycle(state);

    CREATE TABLE IF NOT EXISTS lifecycle_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      path         TEXT NOT NULL,
      from_state   TEXT NOT NULL,
      to_state     TEXT NOT NULL,
      changed_by   TEXT NOT NULL DEFAULT 'system',
      reason       TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_hist_path ON lifecycle_history(path);
  `);
}

// ── Core operations ────────────────────────────────────────────────

function rowToRecord(row: Record<string, unknown>): LifecycleRecord {
  return {
    path: row.path as string,
    state: row.state as LifecycleState,
    previousState: (row.previous_state as LifecycleState) || null,
    changedAt: row.changed_at as string,
    changedBy: row.changed_by as string,
    reason: row.reason as string,
  };
}

/**
 * Get the lifecycle state of an artifact.
 * Returns null if no lifecycle record exists (defaults to "active").
 */
export function getLifecycleState(path: string): LifecycleRecord | null {
  ensureTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM doc_lifecycle WHERE path = ?").get(path) as Record<string, unknown> | undefined;
  return row ? rowToRecord(row) : null;
}

/**
 * Get the effective state (returns "active" if no record exists).
 */
export function getEffectiveState(path: string): LifecycleState {
  const record = getLifecycleState(path);
  return record?.state || "active";
}

/**
 * Set the lifecycle state of an artifact.
 */
export function setLifecycleState(
  path: string,
  state: LifecycleState,
  options?: { changedBy?: string; reason?: string },
): LifecycleRecord {
  ensureTable();
  const db = getDb();
  const changedBy = options?.changedBy || "system";
  const reason = options?.reason || `Transitioned to ${state}`;

  const existing = getLifecycleState(path);
  const previousState = existing?.state || "active";

  // Upsert the current state
  db.prepare(`
    INSERT INTO doc_lifecycle (path, state, previous_state, changed_by, reason, changed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(path) DO UPDATE SET
      state = excluded.state,
      previous_state = excluded.previous_state,
      changed_by = excluded.changed_by,
      reason = excluded.reason,
      changed_at = excluded.changed_at
  `).run(path, state, previousState, changedBy, reason);

  // Log the transition
  if (previousState !== state) {
    db.prepare(
      "INSERT INTO lifecycle_history (path, from_state, to_state, changed_by, reason) VALUES (?, ?, ?, ?, ?)"
    ).run(path, previousState, state, changedBy, reason);
  }

  return getLifecycleState(path)!;
}

/**
 * Get lifecycle summary (counts by state).
 */
export function getLifecycleSummary(): LifecycleSummary {
  ensureTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT state, COUNT(*) as count FROM doc_lifecycle GROUP BY state"
  ).all() as Array<{ state: string; count: number }>;

  const summary: LifecycleSummary = { draft: 0, active: 0, stale: 0, archived: 0, total: 0 };
  for (const r of rows) {
    if (r.state in summary) (summary as unknown as Record<string, number>)[r.state] = r.count;
    summary.total += r.count;
  }
  return summary;
}

/**
 * Get transition history for an artifact.
 */
export function getTransitionHistory(path: string, limit = 20): LifecycleTransition[] {
  ensureTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM lifecycle_history WHERE path = ? ORDER BY created_at DESC LIMIT ?"
  ).all(path, limit) as Array<Record<string, unknown>>).map((row) => ({
    from: row.from_state as LifecycleState,
    to: row.to_state as LifecycleState,
    path: row.path as string,
    changedBy: row.changed_by as string,
    reason: row.reason as string,
    timestamp: row.created_at as string,
  }));
}

/**
 * Get all artifacts in a specific state.
 */
export function getArtifactsByState(state: LifecycleState, limit = 50): LifecycleRecord[] {
  ensureTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM doc_lifecycle WHERE state = ? ORDER BY changed_at DESC LIMIT ?"
  ).all(state, limit) as Array<Record<string, unknown>>).map(rowToRecord);
}

// ── Automatic transitions ──────────────────────────────────────────

/**
 * Apply automatic lifecycle transitions based on staleness.
 *
 * Rules:
 * - staleDays > staleThreshold → state becomes "stale"
 * - staleDays > archiveThreshold → state becomes "archived"
 * - staleDays <= freshThreshold AND state was "stale" → state becomes "active"
 *
 * Returns count of transitions applied.
 */
export function applyAutoTransitions(
  artifacts: Array<{ path: string; staleDays: number }>,
  thresholds?: { stale?: number; archive?: number; fresh?: number },
): number {
  const staleThreshold = thresholds?.stale || 90;
  const archiveThreshold = thresholds?.archive || 365;
  const freshThreshold = thresholds?.fresh || 7;

  let transitioned = 0;

  for (const a of artifacts) {
    const current = getEffectiveState(a.path);

    if (a.staleDays > archiveThreshold && current !== "archived") {
      setLifecycleState(a.path, "archived", { reason: `Auto-archived: ${a.staleDays} days old (threshold: ${archiveThreshold}d)` });
      transitioned++;
    } else if (a.staleDays > staleThreshold && current === "active") {
      setLifecycleState(a.path, "stale", { reason: `Auto-stale: ${a.staleDays} days old (threshold: ${staleThreshold}d)` });
      transitioned++;
    } else if (a.staleDays <= freshThreshold && current === "stale") {
      setLifecycleState(a.path, "active", { reason: `Reactivated: updated within ${freshThreshold} days` });
      transitioned++;
    }
  }

  return transitioned;
}
