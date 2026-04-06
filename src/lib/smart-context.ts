/**
 * Smart context windows — optimally-sized context based on topic + impact scoring.
 *
 * Instead of giving every search result equal space, this module:
 * 1. Searches for relevant artifacts
 * 2. Scores each by combining FTS relevance with impact score
 * 3. Allocates token budget proportionally (high-impact docs get more space)
 * 4. Returns a compact, prioritized context window
 */

import { searchArtifacts, getArtifactContent } from "./db";
import { computeImpactScore } from "./impact-scoring";

// ── Types ──────────────────────────────────────────────────────────

export interface ContextEntry {
  path: string;
  title: string;
  content: string;
  impactScore: number;
  impactLevel: string;
  relevanceScore: number;
  combinedScore: number;
  allocatedChars: number;
  truncated: boolean;
}

export interface SmartContext {
  topic: string;
  entries: ContextEntry[];
  totalChars: number;
  budgetChars: number;
  entryCount: number;
  averageImpact: number;
}

// ── Config ─────────────────────────────────────────────────────────

const DEFAULT_BUDGET = 12000;
const DEFAULT_CANDIDATES = 10;
const DEFAULT_MAX_ENTRIES = 8;

// Impact score → budget multiplier
function budgetMultiplier(impactScore: number): number {
  if (impactScore >= 80) return 2.5;  // critical: 2.5x share
  if (impactScore >= 60) return 1.8;  // high: 1.8x share
  if (impactScore >= 35) return 1.0;  // medium: 1x share (baseline)
  return 0.5;                          // low: 0.5x share
}

// ── Core ───────────────────────────────────────────────────────────

/**
 * Build an optimally-sized context window for a topic.
 *
 * Combines FTS relevance with impact scoring to prioritize
 * what goes into the context and how much space each entry gets.
 */
export function buildSmartContext(
  topic: string,
  options?: {
    budgetChars?: number;
    maxCandidates?: number;
    maxEntries?: number;
  },
): SmartContext {
  const budget = options?.budgetChars || DEFAULT_BUDGET;
  const maxCandidates = options?.maxCandidates || DEFAULT_CANDIDATES;
  const maxEntries = options?.maxEntries || DEFAULT_MAX_ENTRIES;

  // Step 1: Get search candidates
  const searchResults = searchArtifacts(topic, maxCandidates);

  if (searchResults.length === 0) {
    return { topic, entries: [], totalChars: 0, budgetChars: budget, entryCount: 0, averageImpact: 0 };
  }

  // Step 2: Score each candidate (FTS rank + impact)
  const scored = searchResults.map((result, idx) => {
    const impact = computeImpactScore(result.path);
    // FTS relevance: higher rank position = higher score (inverted index)
    const relevanceScore = Math.max(0, 1 - idx / maxCandidates);

    // Combined score: 40% relevance + 60% normalized impact
    const combinedScore = relevanceScore * 0.4 + (impact.score / 100) * 0.6;

    return {
      path: result.path,
      title: result.title,
      impactScore: impact.score,
      impactLevel: impact.level,
      relevanceScore,
      combinedScore,
    };
  });

  // Step 3: Sort by combined score (best first)
  scored.sort((a, b) => b.combinedScore - a.combinedScore);

  // Step 4: Take top entries and allocate budget
  const selected = scored.slice(0, maxEntries);

  // Compute budget shares based on impact multipliers
  const totalMultiplier = selected.reduce((sum, s) => sum + budgetMultiplier(s.impactScore), 0);

  const entries: ContextEntry[] = [];
  let totalChars = 0;

  for (const s of selected) {
    if (totalChars >= budget) break;

    const content = getArtifactContent(s.path);
    if (!content) continue;

    // Allocate proportional budget based on impact
    const share = budgetMultiplier(s.impactScore) / totalMultiplier;
    const allocatedChars = Math.min(
      Math.floor(budget * share),
      content.length,
      budget - totalChars,
    );

    if (allocatedChars < 50) continue; // Skip if allocation too small

    const truncated = allocatedChars < content.length;
    const entryContent = truncated ? content.slice(0, allocatedChars) : content;

    entries.push({
      ...s,
      content: entryContent,
      allocatedChars,
      truncated,
    });

    totalChars += entryContent.length;
  }

  const averageImpact = entries.length > 0
    ? Math.round(entries.reduce((sum, e) => sum + e.impactScore, 0) / entries.length)
    : 0;

  return {
    topic,
    entries,
    totalChars,
    budgetChars: budget,
    entryCount: entries.length,
    averageImpact,
  };
}

/**
 * Format a smart context into a text string suitable for LLM consumption.
 */
export function formatSmartContext(ctx: SmartContext): string {
  if (ctx.entries.length === 0) {
    return `No relevant documents found for topic: "${ctx.topic}"`;
  }

  const parts: string[] = [];
  parts.push(`Context for: "${ctx.topic}" (${ctx.entryCount} sources, avg impact: ${ctx.averageImpact}/100)\n`);

  for (const entry of ctx.entries) {
    const header = `### ${entry.title} (${entry.path}) [impact: ${entry.impactScore}, ${entry.impactLevel}]`;
    const truncNote = entry.truncated ? `\n[...truncated to ${entry.allocatedChars} chars]` : "";
    parts.push(`${header}\n\n${entry.content}${truncNote}`);
  }

  return parts.join("\n\n---\n\n");
}
