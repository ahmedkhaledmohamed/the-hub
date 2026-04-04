/**
 * Conflict detection — finds contradictions between documents.
 *
 * Uses heuristic checks for common conflict patterns, with optional
 * AI-powered deep analysis for nuanced contradictions.
 *
 * Conflict types:
 * - Contradictory facts (different dates, numbers, decisions)
 * - Superseded information (newer doc says opposite of older)
 * - Inconsistent terminology (same concept, different names)
 */

import { getDb, searchArtifacts, getArtifactContent } from "./db";
import { ask, isAiConfigured } from "./ai-client";
import type { Artifact } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export type ConflictSeverity = "high" | "medium" | "low";

export interface Conflict {
  id: string;
  docA: { path: string; title: string; excerpt: string };
  docB: { path: string; title: string; excerpt: string };
  type: "contradictory-fact" | "superseded" | "inconsistent-terminology" | "ai-detected";
  severity: ConflictSeverity;
  description: string;
  detectedAt: string;
}

// ── Heuristic detection ────────────────────────────────────────────

/**
 * Extract key factual claims from text (dates, numbers, decisions).
 */
export function extractClaims(text: string): string[] {
  const claims: string[] = [];

  // Date claims: "launched on March 15" or "deadline is Q2 2026"
  const datePattern = /(?:on|by|before|after|starting|deadline|launch|ship|release)\s+([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?|\d{4}-\d{2}-\d{2}|Q[1-4]\s*\d{4})/gi;
  let match;
  while ((match = datePattern.exec(text)) !== null) {
    claims.push(`date: ${match[0].trim()}`);
  }

  // Number claims: "costs $80/user" or "team of 18"
  const numPattern = /(?:costs?|price|budget|team of|headcount|revenue|users?)\s*(?:is|of|:)?\s*[\$€£]?\d[\d,.]*/gi;
  while ((match = numPattern.exec(text)) !== null) {
    claims.push(`number: ${match[0].trim()}`);
  }

  // Decision claims: "we decided to" or "the approach is"
  const decisionPattern = /(?:we (?:decided|chose|agreed|will)|the (?:approach|strategy|plan|decision) is)\s+(.{10,80})/gi;
  while ((match = decisionPattern.exec(text)) !== null) {
    claims.push(`decision: ${match[0].trim()}`);
  }

  return claims;
}

/**
 * Check if two documents have contradictory claims.
 */
export function findClaimConflicts(
  docA: { path: string; title: string; content: string },
  docB: { path: string; title: string; content: string },
): Conflict[] {
  const conflicts: Conflict[] = [];
  const claimsA = extractClaims(docA.content);
  const claimsB = extractClaims(docB.content);

  // Simple overlap check: same claim type with different values
  for (const a of claimsA) {
    const [typeA, ...restA] = a.split(": ");
    for (const b of claimsB) {
      const [typeB, ...restB] = b.split(": ");
      if (typeA === typeB && restA.join(": ") !== restB.join(": ")) {
        // Same claim type, different value — potential conflict
        conflicts.push({
          id: `conflict:${docA.path}|${docB.path}|${typeA}`,
          docA: { path: docA.path, title: docA.title, excerpt: a },
          docB: { path: docB.path, title: docB.title, excerpt: b },
          type: "contradictory-fact",
          severity: typeA === "decision" ? "high" : "medium",
          description: `Different ${typeA} claims: "${restA.join(": ")}" vs "${restB.join(": ")}"`,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return conflicts;
}

// ── AI-powered detection ───────────────────────────────────────────

export async function detectConflictsWithAI(
  docA: { path: string; title: string; content: string },
  docB: { path: string; title: string; content: string },
): Promise<Conflict[]> {
  if (!isAiConfigured()) return [];

  const prompt = `Compare these two documents and identify any contradictions, conflicts, or inconsistencies.

Document A: "${docA.title}" (${docA.path})
${docA.content.slice(0, 3000)}

Document B: "${docB.title}" (${docB.path})
${docB.content.slice(0, 3000)}

For each conflict found, output exactly this format (one per line):
CONFLICT: <high|medium|low> | <description>

If no conflicts found, output: NO_CONFLICTS`;

  try {
    const result = await ask(prompt, { maxTokens: 500 });
    if (result.model === "none" || result.content.includes("NO_CONFLICTS")) return [];

    const conflicts: Conflict[] = [];
    const lines = result.content.split("\n");

    for (const line of lines) {
      const match = line.match(/CONFLICT:\s*(high|medium|low)\s*\|\s*(.+)/i);
      if (match) {
        conflicts.push({
          id: `ai-conflict:${docA.path}|${docB.path}|${Date.now()}`,
          docA: { path: docA.path, title: docA.title, excerpt: "" },
          docB: { path: docB.path, title: docB.title, excerpt: "" },
          type: "ai-detected",
          severity: match[1].toLowerCase() as ConflictSeverity,
          description: match[2].trim(),
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return conflicts;
  } catch {
    return [];
  }
}

// ── Scan for conflicts ─────────────────────────────────────────────

export async function scanForConflicts(artifacts: Artifact[], options?: { useAI?: boolean }): Promise<Conflict[]> {
  const allConflicts: Conflict[] = [];
  const docs: Array<{ path: string; title: string; content: string }> = [];

  // Load content for artifacts in the same group
  for (const a of artifacts.slice(0, 50)) { // Limit to 50 for performance
    const content = getArtifactContent(a.path);
    if (content && content.length > 100) {
      docs.push({ path: a.path, title: a.title, content });
    }
  }

  // Compare docs within the same group
  const byGroup = new Map<string, typeof docs>();
  for (const doc of docs) {
    const artifact = artifacts.find((a) => a.path === doc.path);
    if (!artifact) continue;
    const group = artifact.group;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(doc);
  }

  for (const [, groupDocs] of byGroup) {
    for (let i = 0; i < groupDocs.length; i++) {
      for (let j = i + 1; j < groupDocs.length; j++) {
        // Heuristic check (always)
        const heuristic = findClaimConflicts(groupDocs[i], groupDocs[j]);
        allConflicts.push(...heuristic);

        // AI check (on request, for docs with heuristic hits)
        if (options?.useAI && heuristic.length > 0) {
          const aiConflicts = await detectConflictsWithAI(groupDocs[i], groupDocs[j]);
          allConflicts.push(...aiConflicts);
        }
      }
    }
  }

  return allConflicts;
}

// ── Helpers ────────────────────────────────────────────────────────

export function conflictSummary(conflicts: Conflict[]): { high: number; medium: number; low: number; total: number } {
  const counts = { high: 0, medium: 0, low: 0, total: conflicts.length };
  for (const c of conflicts) counts[c.severity]++;
  return counts;
}
