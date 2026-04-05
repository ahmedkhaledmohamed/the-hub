/**
 * Notification system — alerts for reviews, annotations, and changes.
 *
 * Stores notifications in SQLite and exposes them via API.
 * Notifications are created when:
 * - A review is completed (approved/changes-requested/dismissed)
 * - An annotation is added to an artifact you authored/reviewed
 * - A doc you depend on changes (via impact scoring)
 *
 * Delivery: stored in DB, surfaced via API + SSE, optionally via Slack.
 */

import { getDb } from "./db";
import { emit } from "./events";

// ── Types ──────────────────────────────────────────────────────────

export type NotificationType = "review" | "annotation" | "change" | "decision" | "system";

export interface Notification {
  id: number;
  recipient: string;
  type: NotificationType;
  title: string;
  message: string;
  artifactPath: string | null;
  read: boolean;
  createdAt: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureNotificationTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient     TEXT NOT NULL,
      type          TEXT NOT NULL,
      title         TEXT NOT NULL,
      message       TEXT NOT NULL DEFAULT '',
      artifact_path TEXT,
      read          INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient);
    CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(read);
    CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications(type);
  `);
}

// ── Row mapping ───────────────────────────────────────────────────

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as number,
    recipient: row.recipient as string,
    type: row.type as NotificationType,
    title: row.title as string,
    message: row.message as string,
    artifactPath: row.artifact_path as string | null,
    read: (row.read as number) === 1,
    createdAt: row.created_at as string,
  };
}

// ── Create ────────────────────────────────────────────────────────

/**
 * Send a notification to a recipient.
 */
export function notify(opts: {
  recipient: string;
  type: NotificationType;
  title: string;
  message?: string;
  artifactPath?: string;
}): number {
  ensureNotificationTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO notifications (recipient, type, title, message, artifact_path) VALUES (?, ?, ?, ?, ?)",
  ).run(opts.recipient, opts.type, opts.title, opts.message || "", opts.artifactPath || null);

  // Emit event for SSE subscribers
  try {
    emit("artifact.modified" as never, {
      notification: true,
      recipient: opts.recipient,
      type: opts.type,
      title: opts.title,
    });
  } catch { /* non-critical */ }

  return result.lastInsertRowid as number;
}

/**
 * Notify about a review status change.
 */
export function notifyReviewUpdate(opts: {
  requestedBy: string;
  reviewer: string;
  status: string;
  artifactPath: string;
  responseMessage?: string;
}): number {
  const statusLabel = opts.status === "approved" ? "approved" : opts.status === "changes-requested" ? "requested changes on" : "dismissed";
  return notify({
    recipient: opts.requestedBy,
    type: "review",
    title: `Review ${statusLabel}`,
    message: `${opts.reviewer} ${statusLabel} your review of "${opts.artifactPath.split("/").pop()}"${opts.responseMessage ? `: ${opts.responseMessage}` : ""}`,
    artifactPath: opts.artifactPath,
  });
}

/**
 * Notify about a new annotation.
 */
export function notifyAnnotation(opts: {
  recipient: string;
  author: string;
  artifactPath: string;
  content: string;
}): number {
  return notify({
    recipient: opts.recipient,
    type: "annotation",
    title: "New comment",
    message: `${opts.author} commented on "${opts.artifactPath.split("/").pop()}": ${opts.content.slice(0, 100)}`,
    artifactPath: opts.artifactPath,
  });
}

/**
 * Notify about a high-impact change.
 */
export function notifyChange(opts: {
  recipient: string;
  artifactPath: string;
  changeSummary: string;
}): number {
  return notify({
    recipient: opts.recipient,
    type: "change",
    title: "Doc updated",
    message: opts.changeSummary,
    artifactPath: opts.artifactPath,
  });
}

// ── Query ─────────────────────────────────────────────────────────

/**
 * Get notifications for a recipient.
 */
export function getNotifications(recipient: string, options?: {
  unreadOnly?: boolean;
  type?: NotificationType;
  limit?: number;
}): Notification[] {
  ensureNotificationTable();
  const db = getDb();
  const limit = options?.limit || 50;

  let sql = "SELECT * FROM notifications WHERE recipient = ?";
  const params: unknown[] = [recipient];

  if (options?.unreadOnly) {
    sql += " AND read = 0";
  }
  if (options?.type) {
    sql += " AND type = ?";
    params.push(options.type);
  }

  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(rowToNotification);
}

/**
 * Get unread notification count for a recipient.
 */
export function getUnreadCount(recipient: string): number {
  ensureNotificationTable();
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE recipient = ? AND read = 0",
  ).get(recipient) as { count: number };
  return row.count;
}

/**
 * Mark a notification as read.
 */
export function markRead(id: number): boolean {
  ensureNotificationTable();
  const db = getDb();
  const result = db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Mark all notifications as read for a recipient.
 */
export function markAllRead(recipient: string): number {
  ensureNotificationTable();
  const db = getDb();
  const result = db.prepare("UPDATE notifications SET read = 1 WHERE recipient = ? AND read = 0").run(recipient);
  return result.changes;
}

/**
 * Delete old read notifications (default: older than 30 days).
 */
export function pruneNotifications(olderThanDays = 30): number {
  ensureNotificationTable();
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM notifications WHERE read = 1 AND created_at < datetime('now', '-' || ? || ' days')",
  ).run(olderThanDays);
  return result.changes;
}
