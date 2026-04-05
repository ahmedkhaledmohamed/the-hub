/**
 * Structured logging for The Hub.
 *
 * Provides a unified logging interface that:
 * - Writes structured JSON logs to SQLite for dashboard queries
 * - Falls back to console for development visibility
 * - Tracks timing for scans, queries, and AI calls
 * - Supports log levels: debug, info, warn, error
 * - Categorizes logs: scan, search, ai, api, system, plugin
 *
 * Usage:
 *   import { hubLog, logTimed } from "@/lib/logger";
 *   hubLog("info", "scan", "Workspace scan complete", { artifacts: 1247, duration: 3200 });
 *   const result = await logTimed("ai", "RAG query", async () => ask(prompt));
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogCategory = "scan" | "search" | "ai" | "api" | "system" | "plugin" | "integration";

export interface LogEntry {
  id: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata: Record<string, unknown>;
  durationMs: number | null;
  createdAt: string;
}

// ── Schema ─────────────────────────────────────────────────────────

let tableReady = false;

function ensureLogTable(): void {
  if (tableReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      level       TEXT NOT NULL,
      category    TEXT NOT NULL,
      message     TEXT NOT NULL,
      metadata    TEXT NOT NULL DEFAULT '{}',
      duration_ms INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_category ON hub_logs(category);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON hub_logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON hub_logs(created_at);
  `);
  tableReady = true;
}

// ── Core logging ──────────────────────────────────────────────────

/**
 * Write a structured log entry.
 */
export function hubLog(
  level: LogLevel,
  category: LogCategory,
  message: string,
  metadata?: Record<string, unknown>,
): void {
  const meta = metadata || {};

  // Always write to console for dev visibility
  const prefix = `[${category}]`;
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
  switch (level) {
    case "error": console.error(`${prefix} ${message}${metaStr}`); break;
    case "warn": console.warn(`${prefix} ${message}${metaStr}`); break;
    case "debug": if (process.env.HUB_LOG_LEVEL === "debug") console.log(`${prefix} ${message}${metaStr}`); break;
    default: console.log(`${prefix} ${message}${metaStr}`); break;
  }

  // Persist to SQLite (non-blocking, non-fatal)
  try {
    ensureLogTable();
    const db = getDb();
    db.prepare(
      "INSERT INTO hub_logs (level, category, message, metadata, duration_ms) VALUES (?, ?, ?, ?, ?)",
    ).run(level, category, message, JSON.stringify(meta), typeof meta.durationMs === "number" ? meta.durationMs : null);
  } catch {
    // Logging should never crash the app
  }
}

// ── Timed operations ──────────────────────────────────────────────

/**
 * Execute an async operation and log its duration.
 */
export async function logTimed<T>(
  category: LogCategory,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    hubLog("info", category, `${operation} completed`, { ...metadata, durationMs });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    hubLog("error", category, `${operation} failed`, {
      ...metadata,
      durationMs,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Execute a sync operation and log its duration.
 */
export function logTimedSync<T>(
  category: LogCategory,
  operation: string,
  fn: () => T,
  metadata?: Record<string, unknown>,
): T {
  const start = Date.now();
  try {
    const result = fn();
    const durationMs = Date.now() - start;
    hubLog("info", category, `${operation} completed`, { ...metadata, durationMs });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    hubLog("error", category, `${operation} failed`, {
      ...metadata,
      durationMs,
      error: (err as Error).message,
    });
    throw err;
  }
}

// ── Query logs ────────────────────────────────────────────────────

/**
 * Get recent log entries.
 */
export function getRecentLogs(options?: {
  limit?: number;
  category?: LogCategory;
  level?: LogLevel;
  since?: string;
}): LogEntry[] {
  ensureLogTable();
  const db = getDb();
  const limit = options?.limit || 100;

  let sql = "SELECT * FROM hub_logs WHERE 1=1";
  const params: unknown[] = [];

  if (options?.category) {
    sql += " AND category = ?";
    params.push(options.category);
  }
  if (options?.level) {
    sql += " AND level = ?";
    params.push(options.level);
  }
  if (options?.since) {
    sql += " AND created_at >= ?";
    params.push(options.since);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(rowToLog);
}

/**
 * Get log counts by category and level.
 */
export function getLogSummary(since?: string): Array<{ category: string; level: string; count: number }> {
  ensureLogTable();
  const db = getDb();

  let sql = "SELECT category, level, COUNT(*) as count FROM hub_logs";
  const params: unknown[] = [];

  if (since) {
    sql += " WHERE created_at >= ?";
    params.push(since);
  }

  sql += " GROUP BY category, level ORDER BY count DESC";
  return db.prepare(sql).all(...params) as Array<{ category: string; level: string; count: number }>;
}

/**
 * Get timing statistics for a category.
 */
export function getTimingStats(category: LogCategory, hours = 24): {
  count: number;
  avgMs: number;
  maxMs: number;
  minMs: number;
  p95Ms: number;
} {
  ensureLogTable();
  const db = getDb();

  const rows = db.prepare(`
    SELECT duration_ms FROM hub_logs
    WHERE category = ? AND duration_ms IS NOT NULL
      AND created_at >= datetime('now', '-' || ? || ' hours')
    ORDER BY duration_ms ASC
  `).all(category, hours) as Array<{ duration_ms: number }>;

  if (rows.length === 0) return { count: 0, avgMs: 0, maxMs: 0, minMs: 0, p95Ms: 0 };

  const durations = rows.map((r) => r.duration_ms);
  const sum = durations.reduce((a, b) => a + b, 0);
  const p95Index = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);

  return {
    count: durations.length,
    avgMs: Math.round(sum / durations.length),
    maxMs: durations[durations.length - 1],
    minMs: durations[0],
    p95Ms: durations[p95Index],
  };
}

/**
 * Clean up old logs (default: older than 7 days).
 */
export function pruneLogs(olderThanDays = 7): number {
  ensureLogTable();
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM hub_logs WHERE created_at < datetime('now', '-' || ? || ' days')",
  ).run(olderThanDays);
  return result.changes;
}

// ── Helpers ───────────────────────────────────────────────────────

function rowToLog(row: Record<string, unknown>): LogEntry {
  return {
    id: row.id as number,
    level: row.level as LogLevel,
    category: row.category as LogCategory,
    message: row.message as string,
    metadata: JSON.parse((row.metadata as string) || "{}"),
    durationMs: row.duration_ms as number | null,
    createdAt: row.created_at as string,
  };
}
