/**
 * Scan-time insight computation — eager impact/decision analysis on file changes.
 *
 * Runs after each scan on changed/added files to precompute:
 * 1. Decision extraction (heuristic) — finds "we decided" patterns
 * 2. Impact score computation — scores each changed artifact
 * 3. Stores results so they're available immediately (not lazily)
 *
 * This makes the workspace_summary, get_decisions, and get_context
 * MCP tools faster and more accurate since data is pre-warmed.
 */

import { getArtifactContent } from "./db";
import { computeImpactScore } from "./impact-scoring";
import { extractDecisionsHeuristic, saveDecision } from "./decision-tracker";

// ── Types ──────────────────────────────────────────────────────────

export interface ScanInsight {
  path: string;
  decisionsExtracted: number;
  impactScore: number;
  impactLevel: string;
  processedAt: string;
}

export interface ScanInsightSummary {
  totalProcessed: number;
  totalDecisions: number;
  highImpactCount: number;
  insights: ScanInsight[];
  durationMs: number;
}

// ── State ──────────────────────────────────────────────────────────

let lastInsightSummary: ScanInsightSummary | null = null;

/**
 * Get the most recent scan insight summary.
 */
export function getLastInsightSummary(): ScanInsightSummary | null {
  return lastInsightSummary;
}

// ── Core ───────────────────────────────────────────────────────────

/**
 * Process a single artifact: extract decisions + compute impact.
 */
export function processArtifactInsights(path: string): ScanInsight {
  let decisionsExtracted = 0;

  // Extract decisions via heuristic patterns
  try {
    const content = getArtifactContent(path);
    if (content) {
      const decisions = extractDecisionsHeuristic(content);
      for (const d of decisions) {
        saveDecision({ artifactPath: path, summary: d.summary, actor: d.actor, source: "heuristic" });
      }
      decisionsExtracted = decisions.length;
    }
  } catch { /* decision extraction non-critical */ }

  // Compute impact score
  let impactScore = 0;
  let impactLevel = "none";
  try {
    const impact = computeImpactScore(path);
    impactScore = impact.score;
    impactLevel = impact.level;
  } catch { /* impact scoring non-critical */ }

  return {
    path,
    decisionsExtracted,
    impactScore,
    impactLevel,
    processedAt: new Date().toISOString(),
  };
}

/**
 * Process insights for all changed/added paths after a scan.
 * Called from manifest-store after scan completes.
 *
 * Caps at 50 files per scan to avoid blocking.
 */
export function processScanInsights(changedPaths: string[]): ScanInsightSummary {
  const start = performance.now();
  const capped = changedPaths.slice(0, 50);

  const insights: ScanInsight[] = [];
  let totalDecisions = 0;
  let highImpactCount = 0;

  for (const path of capped) {
    const insight = processArtifactInsights(path);
    insights.push(insight);
    totalDecisions += insight.decisionsExtracted;
    if (insight.impactScore >= 60) highImpactCount++;
  }

  const durationMs = Math.round((performance.now() - start) * 100) / 100;

  const summary: ScanInsightSummary = {
    totalProcessed: insights.length,
    totalDecisions,
    highImpactCount,
    insights,
    durationMs,
  };

  lastInsightSummary = summary;

  if (insights.length > 0) {
    try {
      const { hubLog } = require("./logger");
      hubLog("info", "scan", "Scan insights computed", {
        processed: insights.length,
        decisions: totalDecisions,
        highImpact: highImpactCount,
        durationMs,
      });
    } catch { /* non-critical */ }
  }

  return summary;
}
