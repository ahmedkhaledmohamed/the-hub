/**
 * Onboarding path generation — reading lists for new team members.
 *
 * Generates an ordered reading list based on:
 * 1. Artifact access frequency (most-viewed first)
 * 2. Knowledge graph centrality (most-linked docs)
 * 3. Staleness (prefer fresh over stale)
 * 4. Group priority (planning > knowledge > other)
 */

import { getDb } from "./db";
import type { Artifact } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface OnboardingItem {
  path: string;
  title: string;
  group: string;
  type: string;
  score: number;
  reason: string;
  estimatedReadTime: number; // minutes
}

export interface OnboardingPath {
  items: OnboardingItem[];
  totalReadTime: number;
  generatedAt: string;
}

// ── Score computation ──────────────────────────────────────────────

const GROUP_PRIORITY: Record<string, number> = {
  planning: 10,
  strategy: 9,
  architecture: 8,
  knowledge: 7,
  docs: 6,
  deliverables: 5,
  other: 1,
};

function getGroupScore(group: string): number {
  return GROUP_PRIORITY[group] || GROUP_PRIORITY.other;
}

export function estimateReadTime(wordCount: number): number {
  // Average reading speed: 200 words per minute
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function computeWordCount(content: string): number {
  return content.split(/\s+/).filter((w) => w.length > 0).length;
}

// ── Onboarding generation ──────────────────────────────────────────

export function generateOnboardingPath(
  artifacts: Artifact[],
  options?: { maxItems?: number; maxMinutes?: number },
): OnboardingPath {
  const maxItems = options?.maxItems || 15;
  const maxMinutes = options?.maxMinutes || 120;
  const db = getDb();

  // Score each artifact
  const scored: Array<OnboardingItem & { rawScore: number }> = [];

  for (const a of artifacts) {
    if (a.type !== "md" && a.type !== "html") continue; // Only readable docs

    let score = 0;
    const reasons: string[] = [];

    // 1. Group priority (0-10)
    const groupScore = getGroupScore(a.group);
    score += groupScore;
    if (groupScore >= 8) reasons.push("critical group");

    // 2. Access frequency (from activity tracking)
    try {
      const row = db.prepare(
        "SELECT COUNT(*) as count FROM artifact_opens WHERE path = ?"
      ).get(a.path) as { count: number } | undefined;
      const openCount = row?.count || 0;
      if (openCount > 10) { score += 5; reasons.push("frequently accessed"); }
      else if (openCount > 3) { score += 3; reasons.push("regularly accessed"); }
    } catch { /* activity table may not exist */ }

    // 3. Backlink count (knowledge graph centrality)
    try {
      const row = db.prepare(
        "SELECT COUNT(*) as count FROM artifact_links WHERE target_path = ?"
      ).get(a.path) as { count: number } | undefined;
      const linkCount = row?.count || 0;
      if (linkCount > 5) { score += 4; reasons.push("highly referenced"); }
      else if (linkCount > 0) { score += 2; reasons.push("referenced by other docs"); }
    } catch { /* links table may not exist */ }

    // 4. Freshness bonus
    if (a.staleDays <= 7) { score += 3; reasons.push("recently updated"); }
    else if (a.staleDays <= 30) { score += 1; }
    else if (a.staleDays > 90) { score -= 2; reasons.push("may be outdated"); }

    // 5. Content length preference (not too short, not too long)
    if (a.size > 500 && a.size < 10000) score += 1;

    // Estimate read time
    let wordCount = 0;
    try {
      const content = db.prepare("SELECT content FROM artifacts WHERE path = ?").get(a.path) as { content: string } | undefined;
      if (content?.content) wordCount = computeWordCount(content.content);
    } catch { /* fallback */ }
    const readTime = wordCount > 0 ? estimateReadTime(wordCount) : Math.ceil(a.size / 1000);

    scored.push({
      path: a.path,
      title: a.title,
      group: a.group,
      type: a.type,
      score,
      rawScore: score,
      reason: reasons.length > 0 ? reasons.join(", ") : "general reference",
      estimatedReadTime: readTime,
    });
  }

  // Sort by score descending
  scored.sort((a, b) => b.rawScore - a.rawScore);

  // Build path within time budget
  const items: OnboardingItem[] = [];
  let totalTime = 0;

  for (const item of scored) {
    if (items.length >= maxItems) break;
    if (totalTime + item.estimatedReadTime > maxMinutes) continue;

    items.push({
      path: item.path,
      title: item.title,
      group: item.group,
      type: item.type,
      score: item.rawScore,
      reason: item.reason,
      estimatedReadTime: item.estimatedReadTime,
    });
    totalTime += item.estimatedReadTime;
  }

  return {
    items,
    totalReadTime: totalTime,
    generatedAt: new Date().toISOString(),
  };
}
