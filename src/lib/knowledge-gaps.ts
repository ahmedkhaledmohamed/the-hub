/**
 * Knowledge gap detection — find topics your workspace lacks documentation for.
 *
 * Analyzes search patterns to detect:
 * - Zero-result searches (topic not covered at all)
 * - Low-result searches (topic barely covered)
 * - Recurring unresolved queries (same topic searched repeatedly)
 * - Agent memory questions without matching docs
 *
 * Surfaces gaps as actionable suggestions: "Create a doc about X"
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type GapSeverity = "critical" | "notable" | "minor";

export interface KnowledgeGap {
  topic: string;
  searchCount: number;
  avgResults: number;
  lastSearched: string;
  severity: GapSeverity;
  suggestion: string;
  sources: Array<"search" | "agent-question">;
}

export interface GapReport {
  gaps: KnowledgeGap[];
  stats: {
    totalGaps: number;
    critical: number;
    notable: number;
    minor: number;
    analyzedQueries: number;
    analyzedDays: number;
  };
  generatedAt: string;
}

// ── Detection ─────────────────────────────────────────────────────

/**
 * Detect knowledge gaps from search patterns and agent questions.
 */
export function detectGaps(options?: {
  days?: number;
  minSearches?: number;
  maxAvgResults?: number;
}): GapReport {
  const days = options?.days || 30;
  const minSearches = options?.minSearches || 2;
  const maxAvgResults = options?.maxAvgResults || 3;
  const db = getDb();

  const gaps: KnowledgeGap[] = [];

  // 1. Find searches with zero or few results
  try {
    ensureSearchTable(db);
    const rows = db.prepare(`
      SELECT query,
        COUNT(*) as search_count,
        AVG(result_count) as avg_results,
        MAX(searched_at) as last_searched
      FROM search_queries
      WHERE searched_at >= datetime('now', '-' || ? || ' days')
      GROUP BY LOWER(TRIM(query))
      HAVING search_count >= ? AND avg_results <= ?
      ORDER BY search_count DESC
      LIMIT 50
    `).all(days, minSearches, maxAvgResults) as Array<{
      query: string; search_count: number; avg_results: number; last_searched: string;
    }>;

    for (const row of rows) {
      const severity = computeSeverity(row.search_count, row.avg_results);
      gaps.push({
        topic: row.query,
        searchCount: row.search_count,
        avgResults: Math.round(row.avg_results * 10) / 10,
        lastSearched: row.last_searched,
        severity,
        suggestion: generateSuggestion(row.query, row.search_count, row.avg_results),
        sources: ["search"],
      });
    }
  } catch { /* search_queries table may not exist */ }

  // 2. Find agent questions that indicate gaps
  try {
    const questionRows = db.prepare(`
      SELECT content as query,
        COUNT(*) as search_count,
        MAX(created_at) as last_searched
      FROM agent_observations
      WHERE type = 'question'
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY LOWER(TRIM(content))
      HAVING search_count >= 1
      ORDER BY search_count DESC
      LIMIT 20
    `).all(days) as Array<{
      query: string; search_count: number; last_searched: string;
    }>;

    for (const row of questionRows) {
      // Check if this question topic is already covered
      const existing = gaps.find((g) => g.topic.toLowerCase() === row.query.toLowerCase());
      if (existing) {
        existing.sources.push("agent-question");
        existing.searchCount += row.search_count;
      } else {
        gaps.push({
          topic: row.query,
          searchCount: row.search_count,
          avgResults: 0,
          lastSearched: row.last_searched,
          severity: "notable",
          suggestion: `An agent asked about "${row.query.slice(0, 80)}" — consider documenting the answer.`,
          sources: ["agent-question"],
        });
      }
    }
  } catch { /* agent_observations table may not exist */ }

  // Sort: critical first, then by search count
  const severityOrder: Record<GapSeverity, number> = { critical: 0, notable: 1, minor: 2 };
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.searchCount - a.searchCount);

  const stats = {
    totalGaps: gaps.length,
    critical: gaps.filter((g) => g.severity === "critical").length,
    notable: gaps.filter((g) => g.severity === "notable").length,
    minor: gaps.filter((g) => g.severity === "minor").length,
    analyzedQueries: gaps.reduce((sum, g) => sum + g.searchCount, 0),
    analyzedDays: days,
  };

  return { gaps, stats, generatedAt: new Date().toISOString() };
}

// ── Helpers ───────────────────────────────────────────────────────

function computeSeverity(searchCount: number, avgResults: number): GapSeverity {
  if (avgResults === 0 && searchCount >= 5) return "critical";
  if (avgResults === 0 && searchCount >= 2) return "notable";
  if (avgResults <= 1 && searchCount >= 3) return "notable";
  return "minor";
}

function generateSuggestion(query: string, searchCount: number, avgResults: number): string {
  if (avgResults === 0) {
    return `"${query}" was searched ${searchCount} time(s) with zero results. Create a doc covering this topic.`;
  }
  return `"${query}" was searched ${searchCount} time(s) with only ${Math.round(avgResults)} result(s) on average. Consider expanding documentation on this topic.`;
}

function ensureSearchTable(db: ReturnType<typeof getDb>): void {
  // The search_queries table is created by activity.ts, but we check here for safety
  try {
    db.prepare("SELECT 1 FROM search_queries LIMIT 1").get();
  } catch {
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_queries (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        query         TEXT NOT NULL,
        result_count  INTEGER NOT NULL DEFAULT 0,
        clicked_path  TEXT,
        searched_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}

/**
 * Format gap report as readable text (for MCP tool output).
 */
export function formatGapReport(report: GapReport): string {
  const lines: string[] = [];
  lines.push(`**Knowledge Gap Report** (${report.stats.analyzedDays} days, ${report.stats.analyzedQueries} queries analyzed)`);
  lines.push(`Found ${report.stats.totalGaps} gap(s): ${report.stats.critical} critical, ${report.stats.notable} notable, ${report.stats.minor} minor`);
  lines.push("");

  if (report.gaps.length === 0) {
    lines.push("No knowledge gaps detected. Your workspace documentation is comprehensive.");
    return lines.join("\n");
  }

  for (const gap of report.gaps) {
    const icon = gap.severity === "critical" ? "🔴" : gap.severity === "notable" ? "🟡" : "🔵";
    lines.push(`${icon} **${gap.topic}** (${gap.severity})`);
    lines.push(`   ${gap.suggestion}`);
    lines.push(`   Searched ${gap.searchCount}× | Avg results: ${gap.avgResults} | Sources: ${gap.sources.join(", ")}`);
    lines.push("");
  }

  return lines.join("\n");
}
