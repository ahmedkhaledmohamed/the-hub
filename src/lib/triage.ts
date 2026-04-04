/**
 * AI change feed triage — classifies changes as routine / attention / breaking.
 *
 * Uses the AI client to analyze change context and assign priority levels.
 * Falls back to heuristic-based classification when AI is not available.
 */

import { ask, isAiConfigured } from "./ai-client";
import { getArtifactContent } from "./db";
import type { ChangeFeedEntry, TriageLevel } from "./types";

// ── Heuristic triage (no AI needed) ───────────────────────────────

export function triageByHeuristic(entry: ChangeFeedEntry): { level: TriageLevel; reason: string } {
  // Deleted files always need attention
  if (entry.type === "deleted") {
    return { level: "attention", reason: "File was deleted" };
  }

  // New files in critical groups
  const criticalGroups = new Set(["strategy", "planning", "architecture", "security"]);
  if (entry.type === "added" && criticalGroups.has(entry.group)) {
    return { level: "attention", reason: `New document in ${entry.group} group` };
  }

  // Large diffs suggest significant changes
  if (entry.diff) {
    const addedLines = entry.diff.filter((l) => l.type === "added").length;
    const removedLines = entry.diff.filter((l) => l.type === "removed").length;
    const totalChanges = addedLines + removedLines;

    if (totalChanges > 20) {
      return { level: "attention", reason: `Major rewrite (${addedLines} additions, ${removedLines} removals)` };
    }

    if (removedLines > addedLines * 2) {
      return { level: "attention", reason: `Significant content removal (${removedLines} lines removed)` };
    }
  }

  // New files are mildly interesting
  if (entry.type === "added") {
    return { level: "routine", reason: "New document added" };
  }

  // Default: routine
  return { level: "routine", reason: "Minor update" };
}

// ── AI-powered triage ──────────────────────────────────────────────

export async function triageByAI(entry: ChangeFeedEntry): Promise<{ level: TriageLevel; reason: string }> {
  if (!isAiConfigured()) {
    return triageByHeuristic(entry);
  }

  const content = getArtifactContent(entry.path);
  const snippet = content?.slice(0, 2000) || "(content unavailable)";

  const diffSummary = entry.diff
    ? entry.diff.slice(0, 10).map((l) => `${l.type === "added" ? "+" : l.type === "removed" ? "-" : " "} ${l.content}`).join("\n")
    : "(no diff available)";

  const prompt = `Classify this workspace change into exactly one category:
- "routine": minor formatting, typo fixes, small updates that don't change meaning
- "attention": significant content changes, new sections, structural reorganization, policy updates
- "breaking": changes that contradict previous content, remove critical information, or require immediate review

Change details:
- File: ${entry.title} (${entry.path})
- Type: ${entry.type}
- Group: ${entry.group}

Content snippet:
${snippet.slice(0, 500)}

Diff:
${diffSummary}

Respond with EXACTLY this format (no other text):
LEVEL: <routine|attention|breaking>
REASON: <one sentence explanation>`;

  try {
    const result = await ask(prompt, { maxTokens: 100 });

    if (result.model === "none") {
      return triageByHeuristic(entry);
    }

    // Parse response
    const levelMatch = result.content.match(/LEVEL:\s*(routine|attention|breaking)/i);
    const reasonMatch = result.content.match(/REASON:\s*(.+)/i);

    if (levelMatch) {
      return {
        level: levelMatch[1].toLowerCase() as TriageLevel,
        reason: reasonMatch?.[1]?.trim() || "AI classified",
      };
    }
  } catch {
    // Fall back to heuristic
  }

  return triageByHeuristic(entry);
}

// ── Batch triage ───────────────────────────────────────────────────

export async function triageChangeFeed(entries: ChangeFeedEntry[]): Promise<ChangeFeedEntry[]> {
  const results: ChangeFeedEntry[] = [];

  for (const entry of entries) {
    // Use heuristic for all (fast), AI for entries the heuristic flags as interesting
    const heuristic = triageByHeuristic(entry);
    let triage = heuristic;

    // Only call AI for entries that heuristic flags as "attention" or new/deleted
    if (isAiConfigured() && (heuristic.level === "attention" || entry.type !== "modified")) {
      triage = await triageByAI(entry);
    }

    results.push({
      ...entry,
      triage: triage.level,
      triageReason: triage.reason,
    });
  }

  return results;
}

// ── Summary ────────────────────────────────────────────────────────

export function triageSummary(entries: ChangeFeedEntry[]): {
  routine: number;
  attention: number;
  breaking: number;
  unknown: number;
} {
  const counts = { routine: 0, attention: 0, breaking: 0, unknown: 0 };
  for (const e of entries) {
    const level = e.triage || "unknown";
    counts[level]++;
  }
  return counts;
}
