import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import type { Artifact } from "./types";
import { runMigrations } from "./migrations";

// ── Database location ──────────────────────────────────────────────

const DB_DIR = resolve(".hub-data");
const DB_PATH = join(DB_DIR, "hub.sqlite");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 1000");
  db.pragma("foreign_keys = ON");

  migrate(db);
  runMigrations(db);
  return db;
}

// ── Schema & Migrations ────────────────────────────────────────────

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      path        TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      type        TEXT NOT NULL,
      "group"     TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      hash        TEXT NOT NULL DEFAULT '',
      modified_at TEXT NOT NULL,
      size        INTEGER NOT NULL DEFAULT 0,
      stale_days  INTEGER NOT NULL DEFAULT 0,
      snippet     TEXT,
      indexed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      path,
      title,
      content,
      snippet,
      content='artifacts',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS index in sync with artifacts table
    CREATE TRIGGER IF NOT EXISTS artifacts_ai AFTER INSERT ON artifacts BEGIN
      INSERT INTO search_index(rowid, path, title, content, snippet)
        VALUES (new.rowid, new.path, new.title, new.content, new.snippet);
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_ad AFTER DELETE ON artifacts BEGIN
      INSERT INTO search_index(search_index, rowid, path, title, content, snippet)
        VALUES ('delete', old.rowid, old.path, old.title, old.content, old.snippet);
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_au AFTER UPDATE ON artifacts BEGIN
      INSERT INTO search_index(search_index, rowid, path, title, content, snippet)
        VALUES ('delete', old.rowid, old.path, old.title, old.content, old.snippet);
      INSERT INTO search_index(rowid, path, title, content, snippet)
        VALUES (new.rowid, new.path, new.title, new.content, new.snippet);
    END;

    -- File mtime cache for incremental scanning
    CREATE TABLE IF NOT EXISTS file_mtimes (
      path        TEXT PRIMARY KEY,
      mtime_ms    INTEGER NOT NULL,
      size        INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ── Content hashing ────────────────────────────────────────────────

export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ── Artifact persistence ───────────────────────────────────────────

const UPSERT_SQL = `
  INSERT INTO artifacts (path, title, type, "group", content, hash, modified_at, size, stale_days, snippet, indexed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(path) DO UPDATE SET
    title = excluded.title,
    type = excluded.type,
    "group" = excluded."group",
    content = excluded.content,
    hash = excluded.hash,
    modified_at = excluded.modified_at,
    size = excluded.size,
    stale_days = excluded.stale_days,
    snippet = excluded.snippet,
    indexed_at = datetime('now')
`;

export function persistArtifacts(
  artifacts: Artifact[],
  contentMap: Map<string, string>,
  options?: { deleteStale?: boolean },
): void {
  const db = getDb();
  const upsert = db.prepare(UPSERT_SQL);
  const shouldDelete = options?.deleteStale ?? true;

  const currentPaths = new Set(artifacts.map((a) => a.path));

  const transaction = db.transaction(() => {
    // Upsert all current artifacts
    for (const a of artifacts) {
      const content = contentMap.get(a.path) || "";
      const hash = contentHash(content);
      upsert.run(a.path, a.title, a.type, a.group, content, hash, a.modifiedAt, a.size, a.staleDays, a.snippet || null);
    }

    // Remove artifacts that no longer exist in the scan
    if (shouldDelete) {
      const existing = db.prepare("SELECT path FROM artifacts").all() as { path: string }[];
      const deleteStmt = db.prepare("DELETE FROM artifacts WHERE path = ?");
      for (const row of existing) {
        if (!currentPaths.has(row.path)) {
          deleteStmt.run(row.path);
        }
      }
    }
  });

  transaction();
}

// ── Query helpers ──────────────────────────────────────────────────

export interface SearchResult {
  path: string;
  title: string;
  type: string;
  group: string;
  snippet: string;
  rank: number;
}

export function searchArtifacts(query: string, limit = 20): SearchResult[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      a.path,
      a.title,
      a.type,
      a."group",
      snippet(search_index, 2, '<mark>', '</mark>', '...', 40) as snippet,
      rank
    FROM search_index
    JOIN artifacts a ON a.path = search_index.path
    WHERE search_index MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  try {
    return stmt.all(query, limit) as SearchResult[];
  } catch {
    // If the FTS query syntax is invalid, fall back to a simple LIKE search
    const fallback = db.prepare(`
      SELECT path, title, type, "group", snippet, 0 as rank
      FROM artifacts
      WHERE title LIKE ? OR content LIKE ? OR path LIKE ?
      LIMIT ?
    `);
    const like = `%${query}%`;
    return fallback.all(like, like, like, limit) as SearchResult[];
  }
}

export function getArtifactContent(artifactPath: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT content FROM artifacts WHERE path = ?').get(artifactPath) as { content: string } | undefined;
  return row?.content ?? null;
}

export function getArtifactCount(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as { count: number };
  return row.count;
}

// ── User state helpers ─────────────────────────────────────────────

export function getUserState(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM user_state WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setUserState(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

// ── Cleanup ────────────────────────────────────────────────────────

// ── Incremental scan helpers ───────────────────────────────────────

export interface FileMtime {
  path: string;
  mtimeMs: number;
  size: number;
}

export function getStoredMtimes(): Map<string, FileMtime> {
  const db = getDb();
  const rows = db.prepare("SELECT path, mtime_ms, size FROM file_mtimes").all() as Array<{
    path: string; mtime_ms: number; size: number;
  }>;
  const map = new Map<string, FileMtime>();
  for (const r of rows) {
    map.set(r.path, { path: r.path, mtimeMs: r.mtime_ms, size: r.size });
  }
  return map;
}

export function updateMtimes(files: FileMtime[]): void {
  const db = getDb();
  const upsert = db.prepare(
    "INSERT INTO file_mtimes (path, mtime_ms, size) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET mtime_ms = excluded.mtime_ms, size = excluded.size"
  );
  const remove = db.prepare("DELETE FROM file_mtimes WHERE path = ?");

  const transaction = db.transaction(() => {
    // Upsert current files
    for (const f of files) {
      upsert.run(f.path, f.mtimeMs, f.size);
    }

    // Remove files that no longer exist
    const currentPaths = new Set(files.map((f) => f.path));
    const stored = db.prepare("SELECT path FROM file_mtimes").all() as Array<{ path: string }>;
    for (const row of stored) {
      if (!currentPaths.has(row.path)) {
        remove.run(row.path);
      }
    }
  });

  transaction();
}

export function getChangedFiles(
  currentFiles: Array<{ path: string; mtimeMs: number; size: number }>,
): { changed: string[]; added: string[]; removed: string[]; unchanged: string[] } {
  const stored = getStoredMtimes();
  const currentPaths = new Set(currentFiles.map((f) => f.path));

  const changed: string[] = [];
  const added: string[] = [];
  const unchanged: string[] = [];

  for (const file of currentFiles) {
    const prev = stored.get(file.path);
    if (!prev) {
      added.push(file.path);
    } else if (prev.mtimeMs !== file.mtimeMs || prev.size !== file.size) {
      changed.push(file.path);
    } else {
      unchanged.push(file.path);
    }
  }

  const removed: string[] = [];
  for (const [storedPath] of stored) {
    if (!currentPaths.has(storedPath)) {
      removed.push(storedPath);
    }
  }

  return { changed, added, removed, unchanged };
}

// ── Cleanup ────────────────────────────────────────────────────────

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
