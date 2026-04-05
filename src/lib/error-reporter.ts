/**
 * Error surfacing — replace silent catches with visible, queryable errors.
 *
 * Provides a centralized error reporting system that:
 * - Collects errors from across the app (scan, AI, search, integrations)
 * - Stores them in SQLite with category, severity, and context
 * - Exposes them via API for dashboard display
 * - Deduplicates repeated errors (same message within a window)
 * - Auto-prunes old errors
 *
 * Usage:
 *   import { reportError, swallow } from "@/lib/error-reporter";
 *
 *   // Instead of: catch { }
 *   // Use: catch (err) { reportError("scan", err, { path: filePath }); }
 *
 *   // Or for truly non-critical: swallow("scan", () => riskyOperation())
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type ErrorCategory = "scan" | "search" | "ai" | "api" | "integration" | "plugin" | "system" | "config";
export type ErrorSeverity = "critical" | "warning" | "info";

export interface ReportedError {
  id: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
}

// ── Schema ─────────────────────────────────────────────────────────

let tableReady = false;

function ensureErrorTable(): void {
  if (tableReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_errors (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'warning',
      message     TEXT NOT NULL,
      stack       TEXT,
      context     TEXT NOT NULL DEFAULT '{}',
      occurrences INTEGER NOT NULL DEFAULT 1,
      first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
      resolved    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_errors_category ON hub_errors(category);
    CREATE INDEX IF NOT EXISTS idx_errors_resolved ON hub_errors(resolved);
    CREATE INDEX IF NOT EXISTS idx_errors_severity ON hub_errors(severity);
  `);
  tableReady = true;
}

// ── Reporting ─────────────────────────────────────────────────────

/**
 * Report an error. Deduplicates if the same message was seen in the last hour.
 */
export function reportError(
  category: ErrorCategory,
  error: unknown,
  context?: Record<string, unknown>,
  severity?: ErrorSeverity,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack || null : null;
  const sev = severity || (message.toLowerCase().includes("timeout") ? "warning" : "warning");

  try {
    ensureErrorTable();
    const db = getDb();

    // Deduplicate: if same category + message within 1 hour, increment occurrences
    const existing = db.prepare(
      "SELECT id FROM hub_errors WHERE category = ? AND message = ? AND resolved = 0 AND last_seen >= datetime('now', '-1 hour')"
    ).get(category, message) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        "UPDATE hub_errors SET occurrences = occurrences + 1, last_seen = datetime('now'), context = ? WHERE id = ?"
      ).run(JSON.stringify(context || {}), existing.id);
    } else {
      db.prepare(
        "INSERT INTO hub_errors (category, severity, message, stack, context) VALUES (?, ?, ?, ?, ?)"
      ).run(category, sev, message, stack, JSON.stringify(context || {}));
    }
  } catch {
    // Error reporting should never itself crash the app
    console.error(`[error-reporter] Failed to persist: [${category}] ${message}`);
  }
}

/**
 * Execute a function, reporting any error instead of silently swallowing.
 * Returns the result or undefined on failure.
 */
export function swallow<T>(
  category: ErrorCategory,
  fn: () => T,
  context?: Record<string, unknown>,
): T | undefined {
  try {
    return fn();
  } catch (err) {
    reportError(category, err, context);
    return undefined;
  }
}

/**
 * Async version of swallow.
 */
export async function swallowAsync<T>(
  category: ErrorCategory,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    reportError(category, err, context);
    return undefined;
  }
}

// ── Queries ───────────────────────────────────────────────────────

/**
 * Get recent unresolved errors.
 */
export function getActiveErrors(options?: {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  limit?: number;
}): ReportedError[] {
  ensureErrorTable();
  const db = getDb();
  const limit = options?.limit || 50;

  let sql = "SELECT * FROM hub_errors WHERE resolved = 0";
  const params: unknown[] = [];

  if (options?.category) {
    sql += " AND category = ?";
    params.push(options.category);
  }
  if (options?.severity) {
    sql += " AND severity = ?";
    params.push(options.severity);
  }

  sql += " ORDER BY last_seen DESC LIMIT ?";
  params.push(limit);

  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(rowToError);
}

/**
 * Get error counts by category.
 */
export function getErrorCounts(): Record<ErrorCategory, number> {
  ensureErrorTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT category, COUNT(*) as count FROM hub_errors WHERE resolved = 0 GROUP BY category"
  ).all() as Array<{ category: string; count: number }>;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.category] = r.count;
  return counts as Record<ErrorCategory, number>;
}

/**
 * Get total error count and breakdown by severity.
 */
export function getErrorSummary(): { total: number; critical: number; warning: number; info: number } {
  ensureErrorTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT severity, COUNT(*) as count FROM hub_errors WHERE resolved = 0 GROUP BY severity"
  ).all() as Array<{ severity: string; count: number }>;

  const summary = { total: 0, critical: 0, warning: 0, info: 0 };
  for (const r of rows) {
    summary[r.severity as keyof typeof summary] = r.count;
    summary.total += r.count;
  }
  return summary;
}

/**
 * Resolve an error (mark as handled).
 */
export function resolveError(id: number): boolean {
  ensureErrorTable();
  const db = getDb();
  const result = db.prepare("UPDATE hub_errors SET resolved = 1 WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Resolve all errors in a category.
 */
export function resolveErrorsByCategory(category: ErrorCategory): number {
  ensureErrorTable();
  const db = getDb();
  const result = db.prepare("UPDATE hub_errors SET resolved = 1 WHERE category = ? AND resolved = 0").run(category);
  return result.changes;
}

/**
 * Prune old resolved errors (default: older than 30 days).
 */
export function pruneErrors(olderThanDays = 30): number {
  ensureErrorTable();
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM hub_errors WHERE resolved = 1 AND last_seen < datetime('now', '-' || ? || ' days')"
  ).run(olderThanDays);
  return result.changes;
}

// ── Helpers ───────────────────────────────────────────────────────

function rowToError(row: Record<string, unknown>): ReportedError {
  return {
    id: row.id as number,
    category: row.category as ErrorCategory,
    severity: row.severity as ErrorSeverity,
    message: row.message as string,
    stack: row.stack as string | null,
    context: JSON.parse((row.context as string) || "{}"),
    occurrences: row.occurrences as number,
    firstSeen: row.first_seen as string,
    lastSeen: row.last_seen as string,
    resolved: (row.resolved as number) === 1,
  };
}
