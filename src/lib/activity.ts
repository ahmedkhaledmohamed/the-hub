/**
 * Activity tracking and personalization.
 *
 * Tracks artifact opens and search queries in SQLite.
 * Provides frequency-based ranking boosts and activity summaries.
 */

import { getDb } from "./db";

// ── Schema ─────────────────────────────────────────────────────────

function ensureActivityTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifact_opens (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      path      TEXT NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_opens_path ON artifact_opens(path);
    CREATE INDEX IF NOT EXISTS idx_opens_at ON artifact_opens(opened_at);

    CREATE TABLE IF NOT EXISTS search_queries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      query         TEXT NOT NULL,
      result_count  INTEGER NOT NULL DEFAULT 0,
      clicked_path  TEXT,
      searched_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_queries_at ON search_queries(searched_at);
  `);
}

// ── Artifact opens ─────────────────────────────────────────────────

export function trackOpen(path: string): void {
  ensureActivityTables();
  const db = getDb();
  db.prepare("INSERT INTO artifact_opens (path) VALUES (?)").run(path);
}

export interface OpenCount {
  path: string;
  count: number;
}

export function getTopOpened(days = 7, limit = 10): OpenCount[] {
  ensureActivityTables();
  const db = getDb();
  return db.prepare(`
    SELECT path, COUNT(*) as count
    FROM artifact_opens
    WHERE opened_at >= datetime('now', '-' || ? || ' days')
    GROUP BY path
    ORDER BY count DESC
    LIMIT ?
  `).all(days, limit) as OpenCount[];
}

export function getOpenCount(path: string, days = 7): number {
  ensureActivityTables();
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM artifact_opens
    WHERE path = ? AND opened_at >= datetime('now', '-' || ? || ' days')
  `).get(path, days) as { count: number };
  return row.count;
}

export function getTotalOpens(days = 7): number {
  ensureActivityTables();
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM artifact_opens
    WHERE opened_at >= datetime('now', '-' || ? || ' days')
  `).get(days) as { count: number };
  return row.count;
}

// ── Search queries ─────────────────────────────────────────────────

export function trackSearch(query: string, resultCount: number, clickedPath?: string): void {
  ensureActivityTables();
  const db = getDb();
  db.prepare(
    "INSERT INTO search_queries (query, result_count, clicked_path) VALUES (?, ?, ?)"
  ).run(query, resultCount, clickedPath || null);
}

export interface SearchGap {
  query: string;
  searchCount: number;
  lastSearched: string;
}

export function getSearchGaps(days = 14, limit = 5): SearchGap[] {
  ensureActivityTables();
  const db = getDb();
  return db.prepare(`
    SELECT query, COUNT(*) as searchCount, MAX(searched_at) as lastSearched
    FROM search_queries
    WHERE result_count = 0
      AND searched_at >= datetime('now', '-' || ? || ' days')
    GROUP BY query
    ORDER BY searchCount DESC
    LIMIT ?
  `).all(days, limit) as SearchGap[];
}

export interface PopularSearch {
  query: string;
  searchCount: number;
}

export function getPopularSearches(days = 7, limit = 5): PopularSearch[] {
  ensureActivityTables();
  const db = getDb();
  return db.prepare(`
    SELECT query, COUNT(*) as searchCount
    FROM search_queries
    WHERE searched_at >= datetime('now', '-' || ? || ' days')
    GROUP BY query
    ORDER BY searchCount DESC
    LIMIT ?
  `).all(days, limit) as PopularSearch[];
}

// ── Personalized ranking boost ─────────────────────────────────────

/**
 * Returns a Map of artifact paths to frequency-based boost scores (0-1).
 * Used by Cmd+K to prioritize frequently accessed artifacts.
 */
export function getBoostScores(days = 14): Map<string, number> {
  const topOpened = getTopOpened(days, 50);
  if (topOpened.length === 0) return new Map();

  const maxCount = topOpened[0].count;
  const scores = new Map<string, number>();

  for (const { path, count } of topOpened) {
    scores.set(path, count / maxCount); // Normalize to 0-1
  }

  return scores;
}

// ── Activity summary ───────────────────────────────────────────────

export interface ActivitySummary {
  totalOpens: number;
  topArtifacts: Array<{ path: string; title: string; count: number }>;
  searchGaps: SearchGap[];
  popularSearches: PopularSearch[];
}

export function getActivitySummary(days = 7): ActivitySummary {
  ensureActivityTables();
  const db = getDb();

  const topOpened = getTopOpened(days, 5);

  // Enrich with titles
  const getTitle = db.prepare('SELECT title FROM artifacts WHERE path = ?');
  const topArtifacts = topOpened.map((o) => {
    const row = getTitle.get(o.path) as { title: string } | undefined;
    return {
      path: o.path,
      title: row?.title || o.path.split("/").pop() || o.path,
      count: o.count,
    };
  });

  return {
    totalOpens: getTotalOpens(days),
    topArtifacts,
    searchGaps: getSearchGaps(days, 3),
    popularSearches: getPopularSearches(days, 3),
  };
}
