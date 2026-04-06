/**
 * Auto-fix suggestions — AI-generated merge diffs for duplicate/similar documents.
 *
 * When hygiene analysis finds duplicates or near-duplicates, this module
 * generates a suggested merged version using the AI client. The user can
 * then review and apply the merge.
 *
 * Works without AI too — generates a simple concatenated merge as fallback.
 */

import { getArtifactContent } from "./db";
import { isAiConfigured, complete } from "./ai-client";
import type { HygieneFinding } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface AutoFixSuggestion {
  findingId: string;
  type: "merge" | "delete" | "rename";
  description: string;
  /** The suggested merged content (for merge type) */
  mergedContent?: string;
  /** Which file to keep (for delete type) */
  keepPath?: string;
  /** Which files to delete */
  deletePaths?: string[];
  /** Whether AI was used to generate the suggestion */
  aiGenerated: boolean;
}

// ── Core ───────────────────────────────────────────────────────────

/**
 * Generate a merge suggestion for a duplicate/near-duplicate finding.
 * Uses AI if configured, falls back to simple concatenation.
 */
export async function generateMergeSuggestion(finding: HygieneFinding): Promise<AutoFixSuggestion | null> {
  if (finding.artifacts.length < 2) return null;

  const contents: Array<{ path: string; title: string; content: string }> = [];
  for (const a of finding.artifacts) {
    const content = getArtifactContent(a.path);
    if (content) {
      contents.push({ path: a.path, title: a.title, content });
    }
  }

  if (contents.length < 2) return null;

  // Try AI-powered merge
  if (isAiConfigured()) {
    try {
      return await generateAiMerge(finding, contents);
    } catch {
      // Fall through to simple merge
    }
  }

  // Fallback: simple merge
  return generateSimpleMerge(finding, contents);
}

/**
 * AI-powered merge: sends both docs to LLM and asks for a merged version.
 */
async function generateAiMerge(
  finding: HygieneFinding,
  contents: Array<{ path: string; title: string; content: string }>,
): Promise<AutoFixSuggestion> {
  const docTexts = contents.map((c, i) =>
    `--- Document ${i + 1}: ${c.title} (${c.path}) ---\n\n${c.content.slice(0, 4000)}`
  ).join("\n\n");

  const result = await complete({
    messages: [
      {
        role: "system",
        content: `You are a document merge assistant. Given two similar or duplicate documents, create a single merged version that:
1. Preserves all unique information from both documents
2. Removes redundant content
3. Maintains a clear structure with proper headings
4. Uses markdown formatting
5. Is concise but complete

Return ONLY the merged document content, no explanations.`,
      },
      {
        role: "user",
        content: `These documents were flagged as ${finding.type} (${finding.similarity ? Math.round(finding.similarity * 100) + "% similar" : "duplicates"}). Please merge them into a single document:\n\n${docTexts}`,
      },
    ],
    maxTokens: 2048,
    temperature: 0.1,
  });

  return {
    findingId: finding.id,
    type: "merge",
    description: `AI-generated merge of ${contents.length} documents (${finding.type})`,
    mergedContent: result.content,
    keepPath: contents[0].path,
    deletePaths: contents.slice(1).map((c) => c.path),
    aiGenerated: true,
  };
}

/**
 * Simple merge: concatenates documents with headers.
 */
function generateSimpleMerge(
  finding: HygieneFinding,
  contents: Array<{ path: string; title: string; content: string }>,
): AutoFixSuggestion {
  const sections = contents.map((c) =>
    `## From: ${c.title} (${c.path})\n\n${c.content}`
  );

  const merged = `# Merged Document\n\n> Auto-generated merge of ${contents.length} ${finding.type} documents.\n> Review and edit before saving.\n\n${sections.join("\n\n---\n\n")}`;

  return {
    findingId: finding.id,
    type: "merge",
    description: `Simple merge of ${contents.length} documents (${finding.type})`,
    mergedContent: merged,
    keepPath: contents[0].path,
    deletePaths: contents.slice(1).map((c) => c.path),
    aiGenerated: false,
  };
}

/**
 * Generate a delete suggestion (keep the best version, delete the rest).
 */
export function generateDeleteSuggestion(finding: HygieneFinding): AutoFixSuggestion | null {
  if (finding.artifacts.length < 2) return null;

  // Keep the most recently modified, delete the rest
  const sorted = [...finding.artifacts].sort(
    (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
  );

  return {
    findingId: finding.id,
    type: "delete",
    description: `Keep "${sorted[0].title}" (most recent), delete ${sorted.length - 1} duplicate(s)`,
    keepPath: sorted[0].path,
    deletePaths: sorted.slice(1).map((a) => a.path),
    aiGenerated: false,
  };
}

/**
 * Generate auto-fix suggestions for all duplicate/near-duplicate findings.
 */
export async function generateAutoFixes(
  findings: HygieneFinding[],
): Promise<AutoFixSuggestion[]> {
  const mergeable = findings.filter((f) =>
    f.type === "exact-duplicate" || f.type === "near-duplicate"
  );

  const suggestions: AutoFixSuggestion[] = [];

  for (const finding of mergeable.slice(0, 10)) {
    if (finding.type === "exact-duplicate") {
      // For exact duplicates, suggest delete (no merge needed)
      const del = generateDeleteSuggestion(finding);
      if (del) suggestions.push(del);
    } else {
      // For near-duplicates, suggest merge
      const merge = await generateMergeSuggestion(finding);
      if (merge) suggestions.push(merge);
    }
  }

  return suggestions;
}
