/**
 * End-to-end change pipeline — automatic intelligence extraction.
 *
 * When a file changes:
 *   1. Extract decisions from the changed doc
 *   2. Score the impact (who needs to know?)
 *   3. Emit enriched events via the event bus (→ SSE → agents)
 *
 * This connects the existing modules into an automatic pipeline
 * that runs on every scan, turning file changes into actionable
 * intelligence without human intervention.
 */

import { on, emit } from "./events";
import type { HubEvent } from "./events";

// ── Types ──────────────────────────────────────────────────────────

export interface PipelineResult {
  path: string;
  decisionsExtracted: number;
  impactScore: number;
  impactLevel: string;
  stakeholders: string[];
  processedAt: string;
}

export interface PipelineStats {
  totalProcessed: number;
  decisionsExtracted: number;
  highImpactCount: number;
  lastRunAt: string | null;
}

// ── State ─────────────────────────────────────────────────────────

let pipelineActive = false;
let stats: PipelineStats = {
  totalProcessed: 0,
  decisionsExtracted: 0,
  highImpactCount: 0,
  lastRunAt: null,
};

// ── Pipeline processing ───────────────────────────────────────────

/**
 * Process a single changed artifact through the intelligence pipeline.
 */
export async function processArtifact(path: string): Promise<PipelineResult> {
  const result: PipelineResult = {
    path,
    decisionsExtracted: 0,
    impactScore: 0,
    impactLevel: "none",
    stakeholders: [],
    processedAt: new Date().toISOString(),
  };

  // Step 1: Extract decisions from the changed doc
  try {
    const { extractAndSaveDecisions } = require("./decision-tracker");
    const count = await extractAndSaveDecisions(path, { useAI: false }); // heuristic only for speed
    result.decisionsExtracted = count;
    stats.decisionsExtracted += count;
  } catch { /* decision extraction is non-critical */ }

  // Step 2: Score the impact
  try {
    const { computeImpactScore } = require("./impact-scoring");
    const score = computeImpactScore(path);
    result.impactScore = score.score;
    result.impactLevel = score.level;
    result.stakeholders = score.stakeholders.map((s: { name: string }) => s.name);
    if (score.level === "high" || score.level === "critical") {
      stats.highImpactCount++;
    }
  } catch { /* impact scoring is non-critical */ }

  // Step 3: Emit enriched event
  try {
    emit("artifact.modified" as never, {
      path,
      decisionsExtracted: result.decisionsExtracted,
      impactScore: result.impactScore,
      impactLevel: result.impactLevel,
      stakeholders: result.stakeholders,
      pipeline: true,
    });
  } catch { /* event emission is non-critical */ }

  // Log via structured logger
  try {
    const { hubLog } = require("./logger");
    hubLog("info", "system", "Pipeline processed artifact", {
      path,
      decisions: result.decisionsExtracted,
      impact: result.impactScore,
      level: result.impactLevel,
    });
  } catch { /* non-critical */ }

  stats.totalProcessed++;
  stats.lastRunAt = result.processedAt;

  return result;
}

/**
 * Process multiple changed artifacts through the pipeline.
 */
export async function processBatch(paths: string[]): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  // Process sequentially to avoid overwhelming the system
  for (const path of paths.slice(0, 20)) { // cap at 20 per batch
    const result = await processArtifact(path);
    results.push(result);
  }
  return results;
}

// ── Event listeners ───────────────────────────────────────────────

/**
 * Start the automatic change pipeline.
 * Listens for scan.complete events and processes changed artifacts.
 */
export function startPipeline(): void {
  if (pipelineActive) return;
  pipelineActive = true;

  on("scan.complete" as never, async (event: HubEvent) => {
    const data = event.data as { added?: string[]; changed?: string[] };
    const paths = [...(data.added || []), ...(data.changed || [])];
    if (paths.length > 0) {
      await processBatch(paths);
    }
  });
}

/**
 * Check if the pipeline is active.
 */
export function isPipelineActive(): boolean {
  return pipelineActive;
}

/**
 * Get pipeline statistics.
 */
export function getPipelineStats(): PipelineStats {
  return { ...stats };
}

/**
 * Reset pipeline statistics (for testing).
 */
export function resetPipelineStats(): void {
  stats = {
    totalProcessed: 0,
    decisionsExtracted: 0,
    highImpactCount: 0,
    lastRunAt: null,
  };
}
