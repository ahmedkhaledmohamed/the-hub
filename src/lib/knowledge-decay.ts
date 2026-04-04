/**
 * Knowledge decay detection — finds docs that lost relevance.
 *
 * Compares recent access patterns against historical ones to detect:
 * - Popular docs that stopped being accessed
 * - Docs with declining access trends
 * - Formerly high-traffic docs with zero recent views
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type DecayLevel = "critical" | "declining" | "stable" | "growing";

export interface DecayReport {
  path: string;
  title: string;
  group: string;
  decayLevel: DecayLevel;
  recentViews: number;
  historicalViews: number;
  decayRatio: number; // 0 = no access, 1 = same, >1 = growing
  lastAccessed: string | null;
  reason: string;
}

// ── Detection ──────────────────────────────────────────────────────

/**
 * Detect knowledge decay by comparing recent (7d) vs historical (30d) access.
 */
export function detectDecay(options?: { recentDays?: number; historicalDays?: number; minHistoricalViews?: number }): DecayReport[] {
  const recentDays = options?.recentDays || 7;
  const historicalDays = options?.historicalDays || 30;
  const minViews = options?.minHistoricalViews || 3;

  const db = getDb();
  const reports: DecayReport[] = [];

  // Get historical access counts (30d)
  let historicalRows: Array<{ path: string; count: number }>;
  try {
    historicalRows = db.prepare(`
      SELECT path, COUNT(*) as count
      FROM artifact_opens
      WHERE opened_at >= datetime('now', '-' || ? || ' days')
      GROUP BY path
      HAVING count >= ?
      ORDER BY count DESC
    `).all(historicalDays, minViews) as Array<{ path: string; count: number }>;
  } catch {
    return []; // activity table may not exist
  }

  if (historicalRows.length === 0) return [];

  // Get recent access counts (7d)
  const recentMap = new Map<string, number>();
  try {
    const recentRows = db.prepare(`
      SELECT path, COUNT(*) as count
      FROM artifact_opens
      WHERE opened_at >= datetime('now', '-' || ? || ' days')
      GROUP BY path
    `).all(recentDays) as Array<{ path: string; count: number }>;
    for (const r of recentRows) recentMap.set(r.path, r.count);
  } catch { /* empty recent */ }

  // Get last access time per path
  const lastAccessMap = new Map<string, string>();
  try {
    const lastRows = db.prepare(`
      SELECT path, MAX(opened_at) as last_at
      FROM artifact_opens
      GROUP BY path
    `).all() as Array<{ path: string; last_at: string }>;
    for (const r of lastRows) lastAccessMap.set(r.path, r.last_at);
  } catch { /* no data */ }

  // Get artifact metadata
  const getArtifact = db.prepare('SELECT title, "group" FROM artifacts WHERE path = ?');

  for (const hist of historicalRows) {
    const recent = recentMap.get(hist.path) || 0;

    // Normalize to per-day rates for fair comparison
    const historicalRate = hist.count / historicalDays;
    const recentRate = recent / recentDays;
    const decayRatio = historicalRate > 0 ? recentRate / historicalRate : 0;

    let decayLevel: DecayLevel;
    let reason: string;

    if (recent === 0) {
      decayLevel = "critical";
      reason = `Was accessed ${hist.count} times in ${historicalDays}d but zero times in last ${recentDays}d`;
    } else if (decayRatio < 0.3) {
      decayLevel = "declining";
      reason = `Access dropped ${Math.round((1 - decayRatio) * 100)}% (${hist.count} in ${historicalDays}d → ${recent} in ${recentDays}d)`;
    } else if (decayRatio > 1.5) {
      decayLevel = "growing";
      reason = `Access increased ${Math.round((decayRatio - 1) * 100)}%`;
    } else {
      decayLevel = "stable";
      reason = "Access pattern is stable";
    }

    const artifact = getArtifact.get(hist.path) as { title: string; group: string } | undefined;

    reports.push({
      path: hist.path,
      title: artifact?.title || hist.path.split("/").pop() || hist.path,
      group: artifact?.group || "other",
      decayLevel,
      recentViews: recent,
      historicalViews: hist.count,
      decayRatio: Math.round(decayRatio * 100) / 100,
      lastAccessed: lastAccessMap.get(hist.path) || null,
      reason,
    });
  }

  // Sort: critical first, then declining
  const order: Record<DecayLevel, number> = { critical: 0, declining: 1, stable: 2, growing: 3 };
  reports.sort((a, b) => order[a.decayLevel] - order[b.decayLevel]);

  return reports;
}

// ── Summary ────────────────────────────────────────────────────────

export function decaySummary(reports: DecayReport[]): Record<DecayLevel, number> {
  const counts: Record<DecayLevel, number> = { critical: 0, declining: 0, stable: 0, growing: 0 };
  for (const r of reports) counts[r.decayLevel]++;
  return counts;
}

/**
 * Get only decaying docs (critical + declining).
 */
export function getDecayingDocs(reports: DecayReport[]): DecayReport[] {
  return reports.filter((r) => r.decayLevel === "critical" || r.decayLevel === "declining");
}
