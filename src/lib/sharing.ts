/**
 * Shared Hub instance management.
 *
 * When sharing is enabled, multiple users can access the same Hub.
 * Access is controlled via API keys mapped to user roles.
 * Read-only users cannot archive, delete, or create artifacts.
 */

import { loadConfig } from "./config";
import { getDb } from "./db";
import { getApiKeys } from "./auth";
import type { SharingConfig, UserRole } from "./types";

// ── Configuration ──────────────────────────────────────────────────

export function getSharingConfig(): SharingConfig | null {
  try {
    const config = loadConfig();
    return config.sharing || null;
  } catch {
    return null;
  }
}

export function isSharingEnabled(): boolean {
  const sharing = getSharingConfig();
  return sharing?.enabled === true;
}

// ── User role resolution ───────────────────────────────────────────

export function getUserRole(apiKey: string | null): UserRole {
  if (!isSharingEnabled()) return "admin"; // No sharing = full access

  const sharing = getSharingConfig();
  if (!sharing) return "admin";

  if (!apiKey) return "anonymous";

  // Check if key maps to a specific user
  if (sharing.users) {
    const user = sharing.users[apiKey];
    if (user) return user.role;
  }

  // Valid API key but no user mapping = default mode
  const validKeys = getApiKeys();
  if (validKeys.includes(apiKey)) {
    return sharing.mode;
  }

  return "anonymous";
}

export function getUserName(apiKey: string | null): string {
  if (!apiKey) return "anonymous";

  const sharing = getSharingConfig();
  if (sharing?.users) {
    const user = sharing.users[apiKey];
    if (user) return user.name;
  }

  return "user";
}

// ── Permission checks ──────────────────────────────────────────────

const WRITE_ACTIONS = new Set([
  "archive", "delete", "create", "update",
  "regenerate", "set-baseline", "run-agent",
]);

export function canPerformAction(role: UserRole, action: string): boolean {
  if (role === "admin") return true;
  if (role === "read-write") return true;
  if (role === "read-only") return !WRITE_ACTIONS.has(action);
  return false; // anonymous
}

export function canWrite(role: UserRole): boolean {
  return role === "admin" || role === "read-write";
}

export function canRead(role: UserRole): boolean {
  return role !== "anonymous";
}

// ── Per-user activity tracking ─────────────────────────────────────

function ensureUserActivityTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_activity (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name  TEXT NOT NULL,
      user_role  TEXT NOT NULL,
      action     TEXT NOT NULL,
      path       TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_user_activity_name ON user_activity(user_name);
  `);
}

export function trackUserActivity(userName: string, role: UserRole, action: string, path?: string): void {
  try {
    ensureUserActivityTable();
    const db = getDb();
    db.prepare(
      "INSERT INTO user_activity (user_name, user_role, action, path) VALUES (?, ?, ?, ?)"
    ).run(userName, role, action, path || null);
  } catch {
    // Non-fatal
  }
}

export interface UserActivityEntry {
  userName: string;
  userRole: string;
  action: string;
  path: string | null;
  createdAt: string;
}

export function getRecentUserActivity(limit = 20): UserActivityEntry[] {
  try {
    ensureUserActivityTable();
    const db = getDb();
    return db.prepare(
      "SELECT user_name as userName, user_role as userRole, action, path, created_at as createdAt FROM user_activity ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as UserActivityEntry[];
  } catch {
    return [];
  }
}

export function getUserActivityCount(userName: string, days = 7): number {
  try {
    ensureUserActivityTable();
    const db = getDb();
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM user_activity WHERE user_name = ? AND created_at >= datetime('now', '-' || ? || ' days')"
    ).get(userName, days) as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

// ── Sharing info ───────────────────────────────────────────────────

export function getSharedUsers(): Array<{ name: string; role: string }> {
  const sharing = getSharingConfig();
  if (!sharing?.users) return [];
  return Object.values(sharing.users).map((u) => ({ name: u.name, role: u.role }));
}
