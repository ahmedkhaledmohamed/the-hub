/**
 * Annotations — comments on artifacts without editing the source file.
 *
 * Stored in SQLite, linked to artifact path + optional line range.
 * Supports author attribution and threading (replies).
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface Annotation {
  id: number;
  artifactPath: string;
  author: string;
  content: string;
  lineStart: number | null;
  lineEnd: number | null;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureAnnotationTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS annotations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_path TEXT NOT NULL,
      author        TEXT NOT NULL DEFAULT 'anonymous',
      content       TEXT NOT NULL,
      line_start    INTEGER,
      line_end      INTEGER,
      parent_id     INTEGER,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES annotations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_path ON annotations(artifact_path);
    CREATE INDEX IF NOT EXISTS idx_annotations_parent ON annotations(parent_id);
  `);
}

// ── CRUD ───────────────────────────────────────────────────────────

export function addAnnotation(opts: {
  artifactPath: string;
  author?: string;
  content: string;
  lineStart?: number;
  lineEnd?: number;
  parentId?: number;
}): number {
  ensureAnnotationTable();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO annotations (artifact_path, author, content, line_start, line_end, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    opts.artifactPath,
    opts.author || "anonymous",
    opts.content,
    opts.lineStart ?? null,
    opts.lineEnd ?? null,
    opts.parentId ?? null,
  );
  return result.lastInsertRowid as number;
}

export function updateAnnotation(id: number, content: string): boolean {
  ensureAnnotationTable();
  const db = getDb();
  const result = db.prepare(
    "UPDATE annotations SET content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content, id);
  return result.changes > 0;
}

export function deleteAnnotation(id: number): boolean {
  ensureAnnotationTable();
  const db = getDb();
  const result = db.prepare("DELETE FROM annotations WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Queries ────────────────────────────────────────────────────────

function rowToAnnotation(row: Record<string, unknown>): Annotation {
  return {
    id: row.id as number,
    artifactPath: row.artifact_path as string,
    author: row.author as string,
    content: row.content as string,
    lineStart: row.line_start as number | null,
    lineEnd: row.line_end as number | null,
    parentId: row.parent_id as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function getAnnotationsForArtifact(artifactPath: string): Annotation[] {
  ensureAnnotationTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM annotations WHERE artifact_path = ? AND parent_id IS NULL ORDER BY created_at DESC"
  ).all(artifactPath) as Record<string, unknown>[];
  return rows.map(rowToAnnotation);
}

export function getReplies(parentId: number): Annotation[] {
  ensureAnnotationTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM annotations WHERE parent_id = ? ORDER BY created_at ASC"
  ).all(parentId) as Record<string, unknown>[];
  return rows.map(rowToAnnotation);
}

export function getAnnotation(id: number): Annotation | null {
  ensureAnnotationTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM annotations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToAnnotation(row) : null;
}

export function getAnnotationCount(artifactPath: string): number {
  ensureAnnotationTable();
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM annotations WHERE artifact_path = ?"
  ).get(artifactPath) as { count: number };
  return row.count;
}

export function getRecentAnnotations(limit = 20): Annotation[] {
  ensureAnnotationTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM annotations ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as Record<string, unknown>[];
  return rows.map(rowToAnnotation);
}

export function getAnnotatedArtifacts(): Array<{ path: string; count: number }> {
  ensureAnnotationTable();
  const db = getDb();
  return db.prepare(
    "SELECT artifact_path as path, COUNT(*) as count FROM annotations GROUP BY artifact_path ORDER BY count DESC"
  ).all() as Array<{ path: string; count: number }>;
}
