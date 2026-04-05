/**
 * Governance and compliance — audit logging, retention policies, compliance tagging.
 *
 * Tracks all access and modifications with user attribution.
 * Enforces retention policies and manages compliance tags.
 */

import { getDb } from "./db";
import { loadConfig } from "./config";
import type { GovernanceConfig, Artifact } from "./types";

// ── Schema ─────────────────────────────────────────────────────────

function ensureGovernanceTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name  TEXT NOT NULL DEFAULT 'system',
      action     TEXT NOT NULL,
      resource   TEXT,
      details    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(created_at);

    CREATE TABLE IF NOT EXISTS compliance_tags (
      path       TEXT NOT NULL,
      tag        TEXT NOT NULL,
      applied_by TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (path, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_compliance_path ON compliance_tags(path);

    CREATE TABLE IF NOT EXISTS retention_queue (
      path       TEXT PRIMARY KEY,
      stale_days INTEGER NOT NULL,
      action     TEXT NOT NULL DEFAULT 'flag',
      flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Configuration ──────────────────────────────────────────────────

export function getGovernanceConfig(): GovernanceConfig | null {
  try {
    const config = loadConfig();
    return config.governance || null;
  } catch (err) {
    try { const { reportError } = require("./error-reporter"); reportError("config", err, { operation: "governance-config" }); } catch { /* non-critical */ }
    return null;
  }
}

export function isGovernanceEnabled(): boolean {
  return getGovernanceConfig() !== null;
}

// ── Audit logging ──────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  userName: string;
  action: string;
  resource: string | null;
  details: string | null;
  createdAt: string;
}

export function logAudit(userName: string, action: string, resource?: string, details?: string): void {
  try {
    ensureGovernanceTables();
    const db = getDb();
    db.prepare(
      "INSERT INTO audit_log (user_name, action, resource, details) VALUES (?, ?, ?, ?)"
    ).run(userName, action, resource || null, details || null);
  } catch {
    // Non-fatal
  }
}

export function getAuditLog(limit = 50, action?: string): AuditEntry[] {
  try {
    ensureGovernanceTables();
    const db = getDb();

    if (action) {
      return db.prepare(
        "SELECT id, user_name as userName, action, resource, details, created_at as createdAt FROM audit_log WHERE action = ? ORDER BY created_at DESC LIMIT ?"
      ).all(action, limit) as AuditEntry[];
    }

    return db.prepare(
      "SELECT id, user_name as userName, action, resource, details, created_at as createdAt FROM audit_log ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as AuditEntry[];
  } catch {
    return [];
  }
}

export function getAuditCount(): number {
  try {
    ensureGovernanceTables();
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM audit_log").get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

// ── Compliance tagging ─────────────────────────────────────────────

export function addComplianceTag(path: string, tag: string, appliedBy = "manual"): void {
  ensureGovernanceTables();
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO compliance_tags (path, tag, applied_by) VALUES (?, ?, ?)"
  ).run(path, tag, appliedBy);
}

export function removeComplianceTag(path: string, tag: string): void {
  ensureGovernanceTables();
  const db = getDb();
  db.prepare("DELETE FROM compliance_tags WHERE path = ? AND tag = ?").run(path, tag);
}

export function getComplianceTags(path: string): string[] {
  try {
    ensureGovernanceTables();
    const db = getDb();
    const rows = db.prepare(
      "SELECT tag FROM compliance_tags WHERE path = ? ORDER BY tag"
    ).all(path) as Array<{ tag: string }>;
    return rows.map((r) => r.tag);
  } catch {
    return [];
  }
}

export function getTaggedArtifacts(tag: string): string[] {
  try {
    ensureGovernanceTables();
    const db = getDb();
    const rows = db.prepare(
      "SELECT path FROM compliance_tags WHERE tag = ? ORDER BY path"
    ).all(tag) as Array<{ path: string }>;
    return rows.map((r) => r.path);
  } catch {
    return [];
  }
}

export function getAllTags(): Array<{ tag: string; count: number }> {
  try {
    ensureGovernanceTables();
    const db = getDb();
    return db.prepare(
      "SELECT tag, COUNT(*) as count FROM compliance_tags GROUP BY tag ORDER BY count DESC"
    ).all() as Array<{ tag: string; count: number }>;
  } catch {
    return [];
  }
}

// ── Retention policy ───────────────────────────────────────────────

export function checkRetentionPolicy(artifacts: Artifact[]): Array<{ path: string; staleDays: number; action: string }> {
  const gov = getGovernanceConfig();
  if (!gov?.retentionPolicy) return [];

  const { maxDays, action } = gov.retentionPolicy;
  const expired = artifacts.filter((a) => a.staleDays > maxDays);

  // Update retention queue
  ensureGovernanceTables();
  const db = getDb();
  const upsert = db.prepare(
    "INSERT INTO retention_queue (path, stale_days, action) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET stale_days = excluded.stale_days"
  );

  const queue: Array<{ path: string; staleDays: number; action: string }> = [];
  for (const a of expired) {
    upsert.run(a.path, a.staleDays, action);
    queue.push({ path: a.path, staleDays: a.staleDays, action });
  }

  return queue;
}

export function getRetentionQueue(): Array<{ path: string; staleDays: number; action: string; flaggedAt: string }> {
  try {
    ensureGovernanceTables();
    const db = getDb();
    return db.prepare(
      "SELECT path, stale_days as staleDays, action, flagged_at as flaggedAt FROM retention_queue ORDER BY stale_days DESC"
    ).all() as Array<{ path: string; staleDays: number; action: string; flaggedAt: string }>;
  } catch {
    return [];
  }
}

export function removeFromRetentionQueue(path: string): void {
  ensureGovernanceTables();
  const db = getDb();
  db.prepare("DELETE FROM retention_queue WHERE path = ?").run(path);
}
