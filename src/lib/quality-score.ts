/**
 * Quality score — per-artifact and workspace-level quality metrics.
 *
 * Each artifact gets a 0-100 quality score based on:
 * - Freshness (0-30): how recently updated
 * - Completeness (0-25): has title, content, reasonable length
 * - Structure (0-20): has headings, not just a wall of text
 * - Metadata (0-15): has proper file extension, in a group
 * - Consistency (0-10): not flagged by hygiene (no duplicates/contradictions)
 *
 * Workspace health is the weighted average of all artifact scores.
 */

import { getArtifactContent } from "./db";
import type { Artifact } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface ArtifactQualityScore {
  path: string;
  title: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: {
    freshness: number;
    completeness: number;
    structure: number;
    metadata: number;
    consistency: number;
  };
}

export interface WorkspaceHealthMetric {
  averageScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  distribution: { A: number; B: number; C: number; D: number; F: number };
  totalArtifacts: number;
  topArtifacts: ArtifactQualityScore[];
  bottomArtifacts: ArtifactQualityScore[];
}

// ── Helpers ────────────────────────────────────────────────────────

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ── Per-artifact scoring ───────────────────────────────────────────

/**
 * Compute freshness score (0-30).
 * Fresh (≤7d) = 30, aging (8-30d) = 20, moderate (31-90d) = 10, stale (>90d) = 0.
 */
function scoreFreshness(staleDays: number): number {
  if (staleDays <= 7) return 30;
  if (staleDays <= 30) return 20;
  if (staleDays <= 90) return 10;
  return 0;
}

/**
 * Compute completeness score (0-25).
 * Checks: has title (5), has content (10), reasonable length (10).
 */
function scoreCompleteness(artifact: Artifact, content: string | null): number {
  let score = 0;
  if (artifact.title && artifact.title.length > 0) score += 5;
  if (content && content.length > 0) score += 10;
  if (content && content.length >= 200) score += 10;
  else if (content && content.length >= 50) score += 5;
  return score;
}

/**
 * Compute structure score (0-20).
 * Checks: has headings (10), has paragraphs (5), not a single line (5).
 */
function scoreStructure(content: string | null): number {
  if (!content) return 0;
  let score = 0;
  // Has headings (markdown # or HTML h1-h6)
  if (/^#+\s/m.test(content) || /<h[1-6]/i.test(content)) score += 10;
  // Has multiple paragraphs (2+ blank line separators)
  if ((content.match(/\n\n/g) || []).length >= 2) score += 5;
  // More than one line
  if ((content.match(/\n/g) || []).length >= 3) score += 5;
  return score;
}

/**
 * Compute metadata score (0-15).
 * Checks: proper extension (5), in a group (5), has snippet (5).
 */
function scoreMetadata(artifact: Artifact): number {
  let score = 0;
  const knownTypes = new Set(["md", "html", "txt", "json", "yaml", "csv", "code", "pdf"]);
  if (knownTypes.has(artifact.type)) score += 5;
  if (artifact.group && artifact.group !== "ungrouped") score += 5;
  if (artifact.snippet && artifact.snippet.length > 0) score += 5;
  return score;
}

/**
 * Compute consistency score (0-10).
 * Deducts points for hygiene flags.
 */
function scoreConsistency(path: string, hygieneFlags: Set<string>): number {
  return hygieneFlags.has(path) ? 0 : 10;
}

/**
 * Compute quality score for a single artifact.
 */
export function computeArtifactQuality(
  artifact: Artifact,
  hygieneFlags?: Set<string>,
): ArtifactQualityScore {
  const content = getArtifactContent(artifact.path);
  const flags = hygieneFlags || new Set<string>();

  const freshness = scoreFreshness(artifact.staleDays);
  const completeness = scoreCompleteness(artifact, content);
  const structure = scoreStructure(content);
  const metadata = scoreMetadata(artifact);
  const consistency = scoreConsistency(artifact.path, flags);

  const score = freshness + completeness + structure + metadata + consistency;

  return {
    path: artifact.path,
    title: artifact.title,
    score,
    grade: scoreToGrade(score),
    breakdown: { freshness, completeness, structure, metadata, consistency },
  };
}

/**
 * Compute quality scores for all artifacts and aggregate workspace health.
 */
export function computeWorkspaceHealth(
  artifacts: Artifact[],
  hygieneFlags?: Set<string>,
): WorkspaceHealthMetric {
  const flags = hygieneFlags || new Set<string>();
  const scores = artifacts.map((a) => computeArtifactQuality(a, flags));

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const averageScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

  const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of scores) distribution[s.grade]++;

  const sorted = [...scores].sort((a, b) => b.score - a.score);

  return {
    averageScore,
    grade: scoreToGrade(averageScore),
    distribution,
    totalArtifacts: artifacts.length,
    topArtifacts: sorted.slice(0, 5),
    bottomArtifacts: sorted.slice(-5).reverse(),
  };
}
