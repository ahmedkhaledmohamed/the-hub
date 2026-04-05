/**
 * Impact scoring — determine who needs to know when a doc changes.
 *
 * Combines signals from multiple sources to compute an impact score
 * for each artifact change, and identifies stakeholders who should
 * be notified:
 *
 * - Access frequency (artifact_opens) — who reads this doc?
 * - Annotations — who comments on this doc?
 * - Reviews — who reviews this doc?
 * - Backlinks (knowledge graph) — what depends on this doc?
 * - User activity — who edits related docs?
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type ImpactLevel = "critical" | "high" | "medium" | "low" | "none";

export interface ImpactScore {
  artifactPath: string;
  title: string;
  score: number; // 0-100
  level: ImpactLevel;
  signals: ImpactSignals;
  stakeholders: Stakeholder[];
  downstreamPaths: string[];
}

export interface ImpactSignals {
  accessCount: number;
  uniqueAccessors: number;
  annotationCount: number;
  reviewCount: number;
  backlinkCount: number;
  dependentCount: number;
}

export interface Stakeholder {
  name: string;
  reason: string;
  relevance: number; // 0-1
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureImpactTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS impact_scores (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_path   TEXT NOT NULL,
      score           REAL NOT NULL DEFAULT 0,
      level           TEXT NOT NULL DEFAULT 'none',
      stakeholders    TEXT NOT NULL DEFAULT '[]',
      downstream      TEXT NOT NULL DEFAULT '[]',
      signals         TEXT NOT NULL DEFAULT '{}',
      computed_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_impact_path ON impact_scores(artifact_path);
    CREATE INDEX IF NOT EXISTS idx_impact_level ON impact_scores(level);
  `);
}

// ── Signal collection ─────────────────────────────────────────────

/**
 * Collect access signals for an artifact.
 */
export function collectAccessSignals(artifactPath: string, days = 30): { count: number; uniqueUsers: string[] } {
  const db = getDb();
  let count = 0;
  const uniqueUsers: string[] = [];

  try {
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM artifact_opens WHERE path = ? AND opened_at >= datetime('now', '-' || ? || ' days')",
    ).get(artifactPath, days) as { count: number } | undefined;
    count = row?.count || 0;
  } catch { /* table may not exist */ }

  // Get unique users from user_activity
  try {
    const rows = db.prepare(
      "SELECT DISTINCT user_name FROM user_activity WHERE path = ? AND created_at >= datetime('now', '-' || ? || ' days')",
    ).all(artifactPath, days) as Array<{ user_name: string }>;
    for (const r of rows) uniqueUsers.push(r.user_name);
  } catch { /* table may not exist */ }

  return { count, uniqueUsers };
}

/**
 * Collect annotation signals for an artifact.
 */
export function collectAnnotationSignals(artifactPath: string): { count: number; authors: string[] } {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT author, COUNT(*) as count FROM annotations WHERE artifact_path = ? GROUP BY author",
    ).all(artifactPath) as Array<{ author: string; count: number }>;
    return {
      count: rows.reduce((sum, r) => sum + r.count, 0),
      authors: rows.map((r) => r.author),
    };
  } catch {
    return { count: 0, authors: [] };
  }
}

/**
 * Collect review signals for an artifact.
 */
export function collectReviewSignals(artifactPath: string): { count: number; reviewers: string[]; requesters: string[] } {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT reviewer, requested_by FROM review_requests WHERE artifact_path = ?",
    ).all(artifactPath) as Array<{ reviewer: string; requested_by: string }>;
    return {
      count: rows.length,
      reviewers: [...new Set(rows.map((r) => r.reviewer))],
      requesters: [...new Set(rows.map((r) => r.requested_by))],
    };
  } catch {
    return { count: 0, reviewers: [], requesters: [] };
  }
}

/**
 * Collect backlink / dependency signals for an artifact.
 */
export function collectBacklinkSignals(artifactPath: string): { backlinkCount: number; dependentPaths: string[] } {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT source_path FROM artifact_links WHERE target_path = ?",
    ).all(artifactPath) as Array<{ source_path: string }>;
    return {
      backlinkCount: rows.length,
      dependentPaths: [...new Set(rows.map((r) => r.source_path))],
    };
  } catch {
    return { backlinkCount: 0, dependentPaths: [] };
  }
}

// ── Score computation ─────────────────────────────────────────────

/**
 * Compute the impact score for an artifact.
 * Score is 0-100 based on weighted signals.
 */
export function computeImpactScore(artifactPath: string, options?: { days?: number }): ImpactScore {
  const days = options?.days || 30;

  const access = collectAccessSignals(artifactPath, days);
  const annotations = collectAnnotationSignals(artifactPath);
  const reviews = collectReviewSignals(artifactPath);
  const backlinks = collectBacklinkSignals(artifactPath);

  const signals: ImpactSignals = {
    accessCount: access.count,
    uniqueAccessors: access.uniqueUsers.length,
    annotationCount: annotations.count,
    reviewCount: reviews.count,
    backlinkCount: backlinks.backlinkCount,
    dependentCount: backlinks.dependentPaths.length,
  };

  // Weighted scoring (0-100)
  const weights = {
    accessFrequency: 20,    // max 20 points
    uniqueAccessors: 20,    // max 20 points
    annotations: 15,        // max 15 points
    reviews: 15,            // max 15 points
    backlinks: 15,          // max 15 points
    dependents: 15,         // max 15 points
  };

  let score = 0;
  score += Math.min(weights.accessFrequency, signals.accessCount * 2);
  score += Math.min(weights.uniqueAccessors, signals.uniqueAccessors * 5);
  score += Math.min(weights.annotations, signals.annotationCount * 3);
  score += Math.min(weights.reviews, signals.reviewCount * 5);
  score += Math.min(weights.backlinks, signals.backlinkCount * 3);
  score += Math.min(weights.dependents, signals.dependentCount * 5);

  score = Math.round(Math.min(100, score));

  const level = scoreToLevel(score);

  // Identify stakeholders
  const stakeholderMap = new Map<string, { reasons: string[]; relevance: number }>();

  for (const user of access.uniqueUsers) {
    addStakeholder(stakeholderMap, user, "accessed this doc", 0.5);
  }
  for (const author of annotations.authors) {
    addStakeholder(stakeholderMap, author, "commented on this doc", 0.7);
  }
  for (const reviewer of reviews.reviewers) {
    addStakeholder(stakeholderMap, reviewer, "reviewed this doc", 0.8);
  }
  for (const requester of reviews.requesters) {
    addStakeholder(stakeholderMap, requester, "requested review", 0.9);
  }

  const stakeholders: Stakeholder[] = [...stakeholderMap.entries()]
    .map(([name, data]) => ({
      name,
      reason: data.reasons.join(", "),
      relevance: Math.round(data.relevance * 100) / 100,
    }))
    .sort((a, b) => b.relevance - a.relevance);

  // Get artifact title
  const db = getDb();
  let title = artifactPath;
  try {
    const row = db.prepare("SELECT title FROM artifacts WHERE path = ?").get(artifactPath) as { title: string } | undefined;
    if (row) title = row.title;
  } catch { /* table may not exist */ }

  return {
    artifactPath,
    title,
    score,
    level,
    signals,
    stakeholders,
    downstreamPaths: backlinks.dependentPaths,
  };
}

function addStakeholder(
  map: Map<string, { reasons: string[]; relevance: number }>,
  name: string,
  reason: string,
  relevance: number,
): void {
  const existing = map.get(name);
  if (existing) {
    existing.reasons.push(reason);
    existing.relevance = Math.max(existing.relevance, relevance);
  } else {
    map.set(name, { reasons: [reason], relevance });
  }
}

export function scoreToLevel(score: number): ImpactLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 10) return "low";
  return "none";
}

// ── Batch scoring ─────────────────────────────────────────────────

/**
 * Compute impact scores for multiple artifacts.
 */
export function computeBatchImpactScores(
  artifactPaths: string[],
  options?: { days?: number },
): ImpactScore[] {
  return artifactPaths.map((path) => computeImpactScore(path, options));
}

/**
 * Get the highest-impact artifacts across the workspace.
 */
export function getHighImpactArtifacts(limit = 20): ImpactScore[] {
  const db = getDb();
  let paths: string[] = [];

  try {
    const rows = db.prepare(
      "SELECT path FROM artifacts ORDER BY path ASC LIMIT 200",
    ).all() as Array<{ path: string }>;
    paths = rows.map((r) => r.path);
  } catch {
    return [];
  }

  const scores = computeBatchImpactScores(paths);
  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Persistence ───────────────────────────────────────────────────

/**
 * Save a computed impact score to the database.
 */
export function saveImpactScore(score: ImpactScore): number {
  ensureImpactTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO impact_scores (artifact_path, score, level, stakeholders, downstream, signals) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    score.artifactPath,
    score.score,
    score.level,
    JSON.stringify(score.stakeholders),
    JSON.stringify(score.downstreamPaths),
    JSON.stringify(score.signals),
  );
  return result.lastInsertRowid as number;
}

/**
 * Get the most recent impact score for an artifact.
 */
export function getLatestImpactScore(artifactPath: string): ImpactScore | null {
  ensureImpactTable();
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM impact_scores WHERE artifact_path = ? ORDER BY computed_at DESC LIMIT 1",
  ).get(artifactPath) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    artifactPath: row.artifact_path as string,
    title: row.artifact_path as string,
    score: row.score as number,
    level: row.level as ImpactLevel,
    signals: JSON.parse(row.signals as string) as ImpactSignals,
    stakeholders: JSON.parse(row.stakeholders as string) as Stakeholder[],
    downstreamPaths: JSON.parse(row.downstream as string) as string[],
  };
}

/**
 * Get impact score history for an artifact.
 */
export function getImpactHistory(artifactPath: string, limit = 10): Array<{ score: number; level: ImpactLevel; computedAt: string }> {
  ensureImpactTable();
  const db = getDb();
  return (db.prepare(
    "SELECT score, level, computed_at FROM impact_scores WHERE artifact_path = ? ORDER BY computed_at DESC LIMIT ?",
  ).all(artifactPath, limit) as Array<{ score: number; level: string; computed_at: string }>).map((r) => ({
    score: r.score,
    level: r.level as ImpactLevel,
    computedAt: r.computed_at,
  }));
}

// ── Summary ───────────────────────────────────────────────────────

export function getImpactSummary(): { total: number; byLevel: Record<ImpactLevel, number> } {
  ensureImpactTable();
  const db = getDb();

  // Get latest score per artifact using subquery
  const rows = db.prepare(`
    SELECT level, COUNT(*) as count FROM (
      SELECT artifact_path, level, ROW_NUMBER() OVER (PARTITION BY artifact_path ORDER BY computed_at DESC) as rn
      FROM impact_scores
    ) WHERE rn = 1 GROUP BY level
  `).all() as Array<{ level: string; count: number }>;

  const byLevel: Record<ImpactLevel, number> = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
  let total = 0;
  for (const r of rows) {
    byLevel[r.level as ImpactLevel] = r.count;
    total += r.count;
  }

  return { total, byLevel };
}
