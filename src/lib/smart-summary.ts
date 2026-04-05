/**
 * Smart change summaries — semantic descriptions of what changed.
 *
 * Instead of "pricing.md was modified (3 lines added, 2 removed)",
 * produces: "Enterprise tier pricing changed from $80/user to $60/user."
 *
 * Uses heuristic analysis of diff content to extract meaningful changes:
 * - Heading changes → "Section renamed from X to Y"
 * - Number changes → "Value changed from X to Y"
 * - Decision language → "New decision: use PostgreSQL"
 * - Added/removed sections → "New section: Deployment Guide"
 * - Config changes → "Setting changed: timeout from 30s to 60s"
 */

// ── Types ──────────────────────────────────────────────────────────

export interface SmartSummary {
  path: string;
  title: string;
  changeType: "content" | "structure" | "config" | "decision" | "minor";
  summary: string;
  details: string[];
  confidence: number; // 0-1
}

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
}

// ── Summary generation ────────────────────────────────────────────

/**
 * Generate a semantic summary from a line-level diff.
 */
export function summarizeChange(
  path: string,
  title: string,
  addedLines: string[],
  removedLines: string[],
): SmartSummary {
  const details: string[] = [];
  let changeType: SmartSummary["changeType"] = "minor";
  let confidence = 0.5;

  // Detect heading changes
  const headingChanges = detectHeadingChanges(addedLines, removedLines);
  if (headingChanges.length > 0) {
    details.push(...headingChanges);
    changeType = "structure";
    confidence = 0.8;
  }

  // Detect number/value changes
  const valueChanges = detectValueChanges(addedLines, removedLines);
  if (valueChanges.length > 0) {
    details.push(...valueChanges);
    if (changeType === "minor") changeType = "content";
    confidence = Math.max(confidence, 0.7);
  }

  // Detect decision language
  const decisions = detectDecisionChanges(addedLines);
  if (decisions.length > 0) {
    details.push(...decisions);
    changeType = "decision";
    confidence = Math.max(confidence, 0.8);
  }

  // Detect new sections
  const newSections = detectNewSections(addedLines);
  if (newSections.length > 0) {
    details.push(...newSections);
    if (changeType === "minor") changeType = "structure";
    confidence = Math.max(confidence, 0.7);
  }

  // Detect removed sections
  const removedSections = detectRemovedSections(removedLines);
  if (removedSections.length > 0) {
    details.push(...removedSections);
    if (changeType === "minor") changeType = "structure";
  }

  // Detect config/setting changes
  const configChanges = detectConfigChanges(addedLines, removedLines);
  if (configChanges.length > 0) {
    details.push(...configChanges);
    if (changeType === "minor") changeType = "config";
    confidence = Math.max(confidence, 0.7);
  }

  // Fallback: line count summary
  if (details.length === 0) {
    if (addedLines.length > 0 && removedLines.length > 0) {
      details.push(`${addedLines.length} line(s) modified, ${removedLines.length} line(s) replaced`);
    } else if (addedLines.length > 0) {
      details.push(`${addedLines.length} line(s) added`);
    } else if (removedLines.length > 0) {
      details.push(`${removedLines.length} line(s) removed`);
    }
    confidence = 0.3;
  }

  // Generate summary sentence
  const summary = generateSummarySentence(title, changeType, details);

  return { path, title, changeType, summary, details, confidence };
}

// ── Detectors ─────────────────────────────────────────────────────

function detectHeadingChanges(added: string[], removed: string[]): string[] {
  const results: string[] = [];
  const addedHeadings = added.filter((l) => l.match(/^#{1,4}\s+/)).map((l) => l.replace(/^#+\s+/, "").trim());
  const removedHeadings = removed.filter((l) => l.match(/^#{1,4}\s+/)).map((l) => l.replace(/^#+\s+/, "").trim());

  for (const rh of removedHeadings) {
    // Check if a similar heading was added (renamed)
    const similar = addedHeadings.find((ah) => {
      const overlap = ah.split(/\s+/).filter((w) => rh.toLowerCase().includes(w.toLowerCase()));
      return overlap.length > 0 && overlap.length < Math.max(ah.split(/\s+/).length, rh.split(/\s+/).length);
    });
    if (similar) {
      results.push(`Section renamed: "${rh}" → "${similar}"`);
    }
  }

  const newHeadings = addedHeadings.filter((ah) => !removedHeadings.some((rh) => rh.toLowerCase() === ah.toLowerCase()));
  for (const h of newHeadings.slice(0, 3)) {
    results.push(`New section: "${h}"`);
  }

  return results;
}

function detectValueChanges(added: string[], removed: string[]): string[] {
  const results: string[] = [];
  const numPattern = /(\$[\d,.]+(?:\/\w+)?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:ms|s|min|hr|days?|GB|MB|KB))/g;

  const removedNumbers = new Map<string, string>();
  for (const line of removed) {
    const matches = line.match(numPattern);
    if (matches) {
      for (const m of matches) {
        // Use surrounding context as key
        const ctx = line.replace(m, "").trim().slice(0, 30);
        removedNumbers.set(ctx, m);
      }
    }
  }

  for (const line of added) {
    const matches = line.match(numPattern);
    if (matches) {
      for (const m of matches) {
        const ctx = line.replace(m, "").trim().slice(0, 30);
        const oldVal = removedNumbers.get(ctx);
        if (oldVal && oldVal !== m) {
          results.push(`Value changed: ${oldVal} → ${m}`);
        }
      }
    }
  }

  return results.slice(0, 5);
}

function detectDecisionChanges(added: string[]): string[] {
  const results: string[] = [];
  const decisionPatterns = [
    /(?:we (?:decided|chose|agreed|will))\s+(.{10,80})/i,
    /(?:decision|resolution|outcome)\s*:\s*(.{10,80})/i,
    /(?:the (?:approach|strategy|plan) is)\s+(.{10,80})/i,
  ];

  for (const line of added) {
    for (const pattern of decisionPatterns) {
      const match = line.match(pattern);
      if (match) {
        results.push(`New decision: "${match[0].trim().slice(0, 80)}"`);
        break;
      }
    }
  }

  return results.slice(0, 3);
}

function detectNewSections(added: string[]): string[] {
  return added
    .filter((l) => l.match(/^#{1,3}\s+/))
    .map((l) => `New section: "${l.replace(/^#+\s+/, "").trim()}"`)
    .slice(0, 3);
}

function detectRemovedSections(removed: string[]): string[] {
  return removed
    .filter((l) => l.match(/^#{1,3}\s+/))
    .map((l) => `Removed section: "${l.replace(/^#+\s+/, "").trim()}"`)
    .slice(0, 3);
}

function detectConfigChanges(added: string[], removed: string[]): string[] {
  const results: string[] = [];
  const configPattern = /(\w+)\s*[:=]\s*(.+)/;

  const removedConfigs = new Map<string, string>();
  for (const line of removed) {
    const match = line.match(configPattern);
    if (match) removedConfigs.set(match[1].trim(), match[2].trim());
  }

  for (const line of added) {
    const match = line.match(configPattern);
    if (match) {
      const key = match[1].trim();
      const newVal = match[2].trim();
      const oldVal = removedConfigs.get(key);
      if (oldVal && oldVal !== newVal) {
        results.push(`Config: ${key} changed from "${oldVal.slice(0, 30)}" to "${newVal.slice(0, 30)}"`);
      }
    }
  }

  return results.slice(0, 5);
}

// ── Summary sentence ──────────────────────────────────────────────

function generateSummarySentence(
  title: string,
  changeType: SmartSummary["changeType"],
  details: string[],
): string {
  if (details.length === 0) return `${title} was updated.`;

  const mainDetail = details[0];

  switch (changeType) {
    case "decision":
      return `${title}: ${mainDetail}`;
    case "structure":
      return `${title} restructured — ${mainDetail}`;
    case "config":
      return `${title}: ${mainDetail}`;
    case "content":
      return `${title} updated — ${mainDetail}`;
    default:
      return `${title} was modified (${mainDetail})`;
  }
}

// ── Batch processing ──────────────────────────────────────────────

/**
 * Generate smart summaries from a diff array.
 */
export function summarizeFromDiff(
  path: string,
  title: string,
  diff: DiffLine[],
): SmartSummary {
  const added = diff.filter((l) => l.type === "added").map((l) => l.content);
  const removed = diff.filter((l) => l.type === "removed").map((l) => l.content);
  return summarizeChange(path, title, added, removed);
}

/**
 * Format a smart summary as readable text.
 */
export function formatSmartSummary(summary: SmartSummary): string {
  let text = `**${summary.summary}** [${summary.changeType}]`;
  if (summary.details.length > 1) {
    text += "\n" + summary.details.slice(1).map((d) => `  - ${d}`).join("\n");
  }
  return text;
}
