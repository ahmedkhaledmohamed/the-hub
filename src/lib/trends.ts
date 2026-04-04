/**
 * Temporal intelligence — trend tracking and predictive alerts.
 *
 * Records daily snapshots of workspace stats. Provides time-series
 * data for sparklines and predictive staleness alerts.
 */

import { getDb } from "./db";
import type { Manifest } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface DailySnapshot {
  date: string; // YYYY-MM-DD
  totalArtifacts: number;
  freshCount: number;
  agingCount: number;
  staleCount: number;
  groupCounts: Record<string, number>;
  groupStale: Record<string, number>;
}

export interface TrendData {
  dates: string[];
  total: number[];
  fresh: number[];
  aging: number[];
  stale: number[];
  stalePercent: number[];
  groups: Record<string, number[]>;
  groupStale: Record<string, number[]>;
}

export interface PredictiveAlert {
  groupId: string;
  groupLabel: string;
  currentStalePercent: number;
  predictedStalePercent: number;
  predictedDate: string;
  trend: "increasing" | "decreasing" | "stable";
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureSnapshotsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      date            TEXT PRIMARY KEY,
      total_artifacts INTEGER NOT NULL,
      fresh_count     INTEGER NOT NULL DEFAULT 0,
      aging_count     INTEGER NOT NULL DEFAULT 0,
      stale_count     INTEGER NOT NULL DEFAULT 0,
      group_counts    TEXT NOT NULL DEFAULT '{}',
      group_stale     TEXT NOT NULL DEFAULT '{}',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Snapshot recording ─────────────────────────────────────────────

export function recordSnapshot(manifest: Manifest): void {
  ensureSnapshotsTable();
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let freshCount = 0, agingCount = 0, staleCount = 0;
  const groupCounts: Record<string, number> = {};
  const groupStale: Record<string, number> = {};

  for (const a of manifest.artifacts) {
    if (a.staleDays <= 7) freshCount++;
    else if (a.staleDays <= 30) agingCount++;
    else staleCount++;

    groupCounts[a.group] = (groupCounts[a.group] || 0) + 1;
    if (a.staleDays > 30) {
      groupStale[a.group] = (groupStale[a.group] || 0) + 1;
    }
  }

  db.prepare(`
    INSERT INTO daily_snapshots (date, total_artifacts, fresh_count, aging_count, stale_count, group_counts, group_stale)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      total_artifacts = excluded.total_artifacts,
      fresh_count = excluded.fresh_count,
      aging_count = excluded.aging_count,
      stale_count = excluded.stale_count,
      group_counts = excluded.group_counts,
      group_stale = excluded.group_stale,
      created_at = datetime('now')
  `).run(today, manifest.artifacts.length, freshCount, agingCount, staleCount,
    JSON.stringify(groupCounts), JSON.stringify(groupStale));
}

// ── Trend retrieval ────────────────────────────────────────────────

export function getTrends(days = 30): TrendData {
  ensureSnapshotsTable();
  const db = getDb();

  const rows = db.prepare(`
    SELECT date, total_artifacts, fresh_count, aging_count, stale_count, group_counts, group_stale
    FROM daily_snapshots
    ORDER BY date DESC
    LIMIT ?
  `).all(days) as Array<{
    date: string;
    total_artifacts: number;
    fresh_count: number;
    aging_count: number;
    stale_count: number;
    group_counts: string;
    group_stale: string;
  }>;

  // Reverse to chronological order
  rows.reverse();

  const dates = rows.map((r) => r.date);
  const total = rows.map((r) => r.total_artifacts);
  const fresh = rows.map((r) => r.fresh_count);
  const aging = rows.map((r) => r.aging_count);
  const stale = rows.map((r) => r.stale_count);
  const stalePercent = rows.map((r) => r.total_artifacts > 0 ? Math.round((r.stale_count / r.total_artifacts) * 100) : 0);

  // Group-level trends
  const allGroupIds = new Set<string>();
  const parsedGroups = rows.map((r) => {
    const gc = JSON.parse(r.group_counts) as Record<string, number>;
    Object.keys(gc).forEach((k) => allGroupIds.add(k));
    return gc;
  });
  const parsedGroupStale = rows.map((r) => {
    const gs = JSON.parse(r.group_stale) as Record<string, number>;
    Object.keys(gs).forEach((k) => allGroupIds.add(k));
    return gs;
  });

  const groups: Record<string, number[]> = {};
  const groupStaleTrend: Record<string, number[]> = {};
  for (const gid of allGroupIds) {
    groups[gid] = parsedGroups.map((gc) => gc[gid] || 0);
    groupStaleTrend[gid] = parsedGroupStale.map((gs) => gs[gid] || 0);
  }

  return { dates, total, fresh, aging, stale, stalePercent, groups, groupStale: groupStaleTrend };
}

// ── Predictive alerts ──────────────────────────────────────────────

export function getPredictiveAlerts(manifest: Manifest): PredictiveAlert[] {
  const trends = getTrends(14); // 2 weeks of data
  if (trends.dates.length < 3) return []; // Need at least 3 data points

  const alerts: PredictiveAlert[] = [];
  const groupMap = new Map(manifest.groups.map((g) => [g.id, g]));

  for (const [groupId, staleCounts] of Object.entries(trends.groupStale)) {
    const totalCounts = trends.groups[groupId];
    if (!totalCounts || totalCounts.length < 3) continue;

    const group = groupMap.get(groupId);
    if (!group) continue;

    const latestTotal = totalCounts[totalCounts.length - 1];
    const latestStale = staleCounts[staleCounts.length - 1];
    if (latestTotal === 0) continue;

    const currentPercent = Math.round((latestStale / latestTotal) * 100);

    // Calculate trend (linear regression slope)
    const stalePercents = staleCounts.map((s, i) => {
      const t = totalCounts[i];
      return t > 0 ? (s / t) * 100 : 0;
    });

    const n = stalePercents.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = stalePercents.reduce((a, b) => a + b, 0);
    const sumXY = stalePercents.reduce((a, y, x) => a + x * y, 0);
    const sumX2 = Array.from({ length: n }, (_, i) => i * i).reduce((a, b) => a + b, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (isNaN(slope) || Math.abs(slope) < 0.5) continue; // Less than 0.5% per day — stable

    const trend = slope > 0 ? "increasing" : "decreasing";

    // Predict when it'll hit 80% stale (if increasing)
    if (trend === "increasing" && currentPercent < 80) {
      const daysTo80 = Math.ceil((80 - currentPercent) / slope);
      if (daysTo80 > 0 && daysTo80 < 90) {
        const predictedDate = new Date();
        predictedDate.setDate(predictedDate.getDate() + daysTo80);

        alerts.push({
          groupId,
          groupLabel: group.label,
          currentStalePercent: currentPercent,
          predictedStalePercent: 80,
          predictedDate: predictedDate.toISOString().slice(0, 10),
          trend,
        });
      }
    }

    // Alert for groups already >50% stale and getting worse
    if (trend === "increasing" && currentPercent >= 50) {
      alerts.push({
        groupId,
        groupLabel: group.label,
        currentStalePercent: currentPercent,
        predictedStalePercent: Math.min(100, Math.round(currentPercent + slope * 14)),
        predictedDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        trend,
      });
    }
  }

  return alerts;
}

export function getSnapshotCount(): number {
  ensureSnapshotsTable();
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM daily_snapshots").get() as { count: number };
  return row.count;
}
