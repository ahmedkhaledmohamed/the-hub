/**
 * Review request system — request and track document reviews.
 *
 * Enables: "I updated this doc, @alice please review."
 * Tracks: pending / approved / changes-requested / dismissed.
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "changes-requested" | "dismissed";

export interface ReviewRequest {
  id: number;
  artifactPath: string;
  requestedBy: string;
  reviewer: string;
  status: ReviewStatus;
  message: string;
  responseMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureReviewTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_requests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_path   TEXT NOT NULL,
      requested_by    TEXT NOT NULL,
      reviewer        TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      message         TEXT NOT NULL DEFAULT '',
      response_message TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_path ON review_requests(artifact_path);
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON review_requests(reviewer);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON review_requests(status);
  `);
}

// ── CRUD ───────────────────────────────────────────────────────────

function rowToReview(row: Record<string, unknown>): ReviewRequest {
  return {
    id: row.id as number,
    artifactPath: row.artifact_path as string,
    requestedBy: row.requested_by as string,
    reviewer: row.reviewer as string,
    status: row.status as ReviewStatus,
    message: row.message as string,
    responseMessage: row.response_message as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createReviewRequest(opts: {
  artifactPath: string;
  requestedBy: string;
  reviewer: string;
  message?: string;
}): number {
  ensureReviewTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO review_requests (artifact_path, requested_by, reviewer, message) VALUES (?, ?, ?, ?)"
  ).run(opts.artifactPath, opts.requestedBy, opts.reviewer, opts.message || "");
  return result.lastInsertRowid as number;
}

export function updateReviewStatus(id: number, status: ReviewStatus, responseMessage?: string): boolean {
  ensureReviewTable();
  const db = getDb();
  const result = db.prepare(
    "UPDATE review_requests SET status = ?, response_message = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, responseMessage || null, id);
  return result.changes > 0;
}

export function getReviewRequest(id: number): ReviewRequest | null {
  ensureReviewTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM review_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToReview(row) : null;
}

// ── Queries ────────────────────────────────────────────────────────

export function getReviewsForArtifact(artifactPath: string): ReviewRequest[] {
  ensureReviewTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM review_requests WHERE artifact_path = ? ORDER BY created_at DESC"
  ).all(artifactPath) as Record<string, unknown>[]).map(rowToReview);
}

export function getReviewsForReviewer(reviewer: string, status?: ReviewStatus): ReviewRequest[] {
  ensureReviewTable();
  const db = getDb();
  if (status) {
    return (db.prepare(
      "SELECT * FROM review_requests WHERE reviewer = ? AND status = ? ORDER BY created_at DESC"
    ).all(reviewer, status) as Record<string, unknown>[]).map(rowToReview);
  }
  return (db.prepare(
    "SELECT * FROM review_requests WHERE reviewer = ? ORDER BY created_at DESC"
  ).all(reviewer) as Record<string, unknown>[]).map(rowToReview);
}

export function getPendingReviews(limit = 20): ReviewRequest[] {
  ensureReviewTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM review_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"
  ).all(limit) as Record<string, unknown>[]).map(rowToReview);
}

export function getReviewCounts(): Record<ReviewStatus, number> {
  ensureReviewTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM review_requests GROUP BY status"
  ).all() as Array<{ status: string; count: number }>;

  const counts: Record<ReviewStatus, number> = { pending: 0, approved: 0, "changes-requested": 0, dismissed: 0 };
  for (const r of rows) counts[r.status as ReviewStatus] = r.count;
  return counts;
}
