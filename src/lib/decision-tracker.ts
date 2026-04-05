/**
 * Decision tracking — extract and track decisions from documents.
 *
 * Combines heuristic extraction (regex patterns) with optional AI-powered
 * extraction for deeper analysis. Tracks who decided, when, source doc,
 * and detects when newer docs contradict earlier decisions.
 */

import { getDb, getArtifactContent } from "./db";
import { ask, isAiConfigured } from "./ai-client";

// ── Types ──────────────────────────────────────────────────────────

export type DecisionStatus = "active" | "superseded" | "reverted";

export interface Decision {
  id: number;
  artifactPath: string;
  summary: string;
  detail: string;
  actor: string | null;
  decidedAt: string | null;
  status: DecisionStatus;
  supersededBy: number | null;
  extractedAt: string;
  source: "heuristic" | "ai";
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureDecisionTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_path   TEXT NOT NULL,
      summary         TEXT NOT NULL,
      detail          TEXT NOT NULL DEFAULT '',
      actor           TEXT,
      decided_at      TEXT,
      status          TEXT NOT NULL DEFAULT 'active',
      superseded_by   INTEGER REFERENCES decisions(id),
      extracted_at    TEXT NOT NULL DEFAULT (datetime('now')),
      source          TEXT NOT NULL DEFAULT 'heuristic'
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_path ON decisions(artifact_path);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
  `);
}

// ── Row mapping ───────────────────────────────────────────────────

function rowToDecision(row: Record<string, unknown>): Decision {
  return {
    id: row.id as number,
    artifactPath: row.artifact_path as string,
    summary: row.summary as string,
    detail: row.detail as string,
    actor: row.actor as string | null,
    decidedAt: row.decided_at as string | null,
    status: row.status as DecisionStatus,
    supersededBy: row.superseded_by as number | null,
    extractedAt: row.extracted_at as string,
    source: row.source as "heuristic" | "ai",
  };
}

// ── Heuristic extraction ──────────────────────────────────────────

/**
 * Extract decisions from text using regex patterns.
 * Looks for phrases like "we decided to", "the decision is", "agreed to", etc.
 */
export function extractDecisionsHeuristic(text: string): Array<{ summary: string; actor: string | null }> {
  const results: Array<{ summary: string; actor: string | null }> = [];
  const seen = new Set<string>();

  // Pattern 1: "We/They/Team decided/chose/agreed to ..."
  const actorPatterns = [
    /(?:(\w+(?:\s+\w+)?)\s+)?(?:decided|chose|agreed|resolved|committed)\s+(?:to\s+)?(.{10,120}?)(?:\.|$)/gim,
  ];

  for (const pattern of actorPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const actor = match[1]?.trim() || null;
      const summary = match[2].trim().replace(/\s+/g, " ");
      const key = summary.toLowerCase().slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ summary, actor: actor && actor.toLowerCase() !== "we" ? actor : null });
      }
    }
  }

  // Pattern 2: "Decision: ..." (heading or label style)
  const labelPattern = /(?:^|\n)\s*(?:decision|resolution|outcome)\s*:\s*(.{10,150}?)(?:\n|$)/gim;
  let match;
  while ((match = labelPattern.exec(text)) !== null) {
    const summary = match[1].trim().replace(/\s+/g, " ");
    const key = summary.toLowerCase().slice(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ summary, actor: null });
    }
  }

  // Pattern 3: "The approach/strategy/plan is to ..."
  const approachPattern = /the\s+(?:approach|strategy|plan|direction)\s+is\s+(?:to\s+)?(.{10,120}?)(?:\.|$)/gim;
  while ((match = approachPattern.exec(text)) !== null) {
    const summary = match[1].trim().replace(/\s+/g, " ");
    const key = summary.toLowerCase().slice(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ summary, actor: null });
    }
  }

  return results;
}

// ── AI extraction ─────────────────────────────────────────────────

export async function extractDecisionsWithAI(
  content: string,
  docPath: string,
): Promise<Array<{ summary: string; actor: string | null; date: string | null }>> {
  if (!isAiConfigured()) return [];

  const prompt = `Analyze this document and extract all decisions that were made.
For each decision, output exactly this format (one per line):
DECISION: <summary> | ACTOR: <who decided or "unknown"> | DATE: <when or "unknown">

Document (${docPath}):
${content.slice(0, 4000)}

If no decisions found, output: NO_DECISIONS`;

  try {
    const result = await ask(prompt, { maxTokens: 500 });
    if (result.model === "none" || result.content.includes("NO_DECISIONS")) return [];

    const decisions: Array<{ summary: string; actor: string | null; date: string | null }> = [];
    for (const line of result.content.split("\n")) {
      const match = line.match(/DECISION:\s*(.+?)\s*\|\s*ACTOR:\s*(.+?)\s*\|\s*DATE:\s*(.+)/i);
      if (match) {
        decisions.push({
          summary: match[1].trim(),
          actor: match[2].trim().toLowerCase() === "unknown" ? null : match[2].trim(),
          date: match[3].trim().toLowerCase() === "unknown" ? null : match[3].trim(),
        });
      }
    }
    return decisions;
  } catch {
    return [];
  }
}

// ── CRUD ──────────────────────────────────────────────────────────

export function saveDecision(opts: {
  artifactPath: string;
  summary: string;
  detail?: string;
  actor?: string | null;
  decidedAt?: string | null;
  source?: "heuristic" | "ai";
}): number {
  ensureDecisionTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO decisions (artifact_path, summary, detail, actor, decided_at, source) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    opts.artifactPath,
    opts.summary,
    opts.detail || "",
    opts.actor || null,
    opts.decidedAt || null,
    opts.source || "heuristic",
  );
  return result.lastInsertRowid as number;
}

export function getDecision(id: number): Decision | null {
  ensureDecisionTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToDecision(row) : null;
}

export function getDecisionsForArtifact(artifactPath: string): Decision[] {
  ensureDecisionTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM decisions WHERE artifact_path = ? ORDER BY extracted_at DESC",
  ).all(artifactPath) as Record<string, unknown>[]).map(rowToDecision);
}

export function getActiveDecisions(limit = 50): Decision[] {
  ensureDecisionTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM decisions WHERE status = 'active' ORDER BY extracted_at DESC LIMIT ?",
  ).all(limit) as Record<string, unknown>[]).map(rowToDecision);
}

export function searchDecisions(query: string): Decision[] {
  ensureDecisionTable();
  const db = getDb();
  const pattern = `%${query}%`;
  return (db.prepare(
    "SELECT * FROM decisions WHERE summary LIKE ? OR detail LIKE ? ORDER BY extracted_at DESC LIMIT 50",
  ).all(pattern, pattern) as Record<string, unknown>[]).map(rowToDecision);
}

export function supersedeDecision(id: number, supersededById: number): boolean {
  ensureDecisionTable();
  const db = getDb();
  const result = db.prepare(
    "UPDATE decisions SET status = 'superseded', superseded_by = ? WHERE id = ?",
  ).run(supersededById, id);
  return result.changes > 0;
}

export function revertDecision(id: number): boolean {
  ensureDecisionTable();
  const db = getDb();
  const result = db.prepare(
    "UPDATE decisions SET status = 'reverted' WHERE id = ?",
  ).run(id);
  return result.changes > 0;
}

export function getDecisionCounts(): Record<DecisionStatus, number> {
  ensureDecisionTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM decisions GROUP BY status",
  ).all() as Array<{ status: string; count: number }>;

  const counts: Record<DecisionStatus, number> = { active: 0, superseded: 0, reverted: 0 };
  for (const r of rows) counts[r.status as DecisionStatus] = r.count;
  return counts;
}

// ── Batch extraction ──────────────────────────────────────────────

/**
 * Extract decisions from a document and persist them.
 * Uses heuristic extraction, with optional AI for deeper analysis.
 */
export async function extractAndSaveDecisions(
  artifactPath: string,
  options?: { useAI?: boolean },
): Promise<number> {
  const content = getArtifactContent(artifactPath);
  if (!content || content.length < 50) return 0;

  let saved = 0;

  // Heuristic extraction
  const heuristic = extractDecisionsHeuristic(content);
  for (const d of heuristic) {
    saveDecision({
      artifactPath,
      summary: d.summary,
      actor: d.actor,
      source: "heuristic",
    });
    saved++;
  }

  // AI extraction (if enabled)
  if (options?.useAI) {
    const aiDecisions = await extractDecisionsWithAI(content, artifactPath);
    for (const d of aiDecisions) {
      saveDecision({
        artifactPath,
        summary: d.summary,
        actor: d.actor,
        decidedAt: d.date,
        source: "ai",
      });
      saved++;
    }
  }

  return saved;
}

// ── Contradiction detection ───────────────────────────────────────

/**
 * Find decisions that may contradict each other.
 * Returns pairs of decisions with similar topics but different conclusions.
 */
export function findContradictions(): Array<{ decisionA: Decision; decisionB: Decision; reason: string }> {
  ensureDecisionTable();
  const db = getDb();

  const active = (db.prepare(
    "SELECT * FROM decisions WHERE status = 'active' ORDER BY extracted_at DESC LIMIT 200",
  ).all() as Record<string, unknown>[]).map(rowToDecision);

  const contradictions: Array<{ decisionA: Decision; decisionB: Decision; reason: string }> = [];

  // Simple word overlap heuristic: decisions with high keyword overlap
  // but from different documents may contradict
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (active[i].artifactPath === active[j].artifactPath) continue;

      const wordsA = new Set(active[i].summary.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      const wordsB = new Set(active[j].summary.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      const overlap = [...wordsA].filter((w) => wordsB.has(w));

      // If >40% keyword overlap between decisions from different docs,
      // they might be about the same topic with different conclusions
      const overlapRatio = overlap.length / Math.min(wordsA.size, wordsB.size);
      if (overlapRatio > 0.4 && overlap.length >= 2) {
        contradictions.push({
          decisionA: active[i],
          decisionB: active[j],
          reason: `Similar topic (shared: ${overlap.join(", ")}) from different documents`,
        });
      }
    }
  }

  return contradictions;
}

// ── Natural language query ─────────────────────────────────────────

/**
 * Query decisions using a natural language question.
 * Extracts keywords, searches across summaries and details,
 * and finds related contradictions.
 *
 * Example: "what was decided about authentication?"
 * → searches for "authentication", "auth", finds matching decisions + contradictions
 */
export function queryDecisions(question: string): {
  decisions: Decision[];
  contradictions: Array<{ decisionA: Decision; decisionB: Decision; reason: string }>;
  keywords: string[];
} {
  ensureDecisionTable();

  // Extract keywords from the question (remove stop words)
  const stopWords = new Set([
    "what", "was", "were", "is", "are", "the", "a", "an", "about",
    "how", "when", "who", "why", "did", "does", "do", "have", "has",
    "been", "decided", "decision", "decisions", "made", "any", "there",
    "which", "that", "this", "for", "with", "from", "our", "we", "they",
  ]);

  const keywords = question
    .toLowerCase()
    .replace(/[?!.,;:'"]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) {
    return { decisions: getActiveDecisions(20), contradictions: [], keywords: [] };
  }

  // Search for each keyword and merge results
  const scoreMap = new Map<number, { decision: Decision; score: number }>();

  for (const keyword of keywords) {
    const results = searchDecisions(keyword);
    for (const d of results) {
      const existing = scoreMap.get(d.id);
      if (existing) {
        existing.score += 1; // boost for matching multiple keywords
      } else {
        scoreMap.set(d.id, { decision: d, score: 1 });
      }
    }
  }

  // Sort by relevance (number of keyword matches)
  const decisions = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => s.decision);

  // Find contradictions among the matched decisions
  const matchedPaths = new Set(decisions.map((d) => d.artifactPath));
  const allContradictions = findContradictions();
  const relevantContradictions = allContradictions.filter(
    (c) => matchedPaths.has(c.decisionA.artifactPath) || matchedPaths.has(c.decisionB.artifactPath),
  );

  return { decisions, contradictions: relevantContradictions, keywords };
}
