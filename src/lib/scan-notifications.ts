/**
 * Scan notification triggers — fire notifications based on scan results.
 *
 * Called after each scan to generate notifications for:
 * - New high-severity hygiene findings
 * - Artifacts crossing the stale threshold (90 days)
 * - Decision contradictions detected
 * - Planning source mentions
 *
 * Rate-limited: each trigger type fires at most once per scan.
 */

import { notify } from "./notifications";
import type { Artifact } from "./types";

const RECIPIENT = "user"; // Personal tool — single user

// Track what was notified last scan to avoid duplicates
let lastHygieneHigh = 0;
let lastStaleCount = 0;

/**
 * Notify on new high-severity hygiene findings.
 */
export function notifyHygieneFindings(): number {
  try {
    const { getCachedHygieneSummary } = require("./hygiene-analyzer");
    const summary = getCachedHygieneSummary();
    if (!summary || summary.high <= lastHygieneHigh) {
      lastHygieneHigh = summary?.high || 0;
      return 0;
    }
    const newCount = summary.high - lastHygieneHigh;
    lastHygieneHigh = summary.high;

    return notify({
      recipient: RECIPIENT,
      type: "change",
      title: "Hygiene: new issues",
      message: `${newCount} new high-severity finding(s). ${summary.high} total high, ${summary.medium} medium.`,
    });
  } catch { return 0; }
}

/**
 * Notify when artifacts cross the stale threshold.
 */
export function notifyNewlyStale(artifacts: Artifact[]): number {
  const stale = artifacts.filter((a) => a.staleDays > 90);
  if (stale.length <= lastStaleCount) {
    lastStaleCount = stale.length;
    return 0;
  }

  const newlyStale = stale.length - lastStaleCount;
  lastStaleCount = stale.length;

  // Pick the most recently crossed artifacts
  const justCrossed = stale
    .filter((a) => a.staleDays >= 90 && a.staleDays <= 100)
    .slice(0, 3);

  const names = justCrossed.map((a) => a.title).join(", ") || `${newlyStale} doc(s)`;

  return notify({
    recipient: RECIPIENT,
    type: "change",
    title: "Docs going stale",
    message: `${newlyStale} doc(s) crossed 90-day threshold: ${names}`,
  });
}

/**
 * Notify on decision contradictions.
 */
export function notifyContradictions(): number {
  try {
    const { findContradictions } = require("./decision-tracker");
    const contradictions = findContradictions();
    if (contradictions.length === 0) return 0;

    return notify({
      recipient: RECIPIENT,
      type: "change",
      title: "Decision contradictions",
      message: `${contradictions.length} contradiction(s) detected. "${contradictions[0].decisionA.summary}" vs "${contradictions[0].decisionB.summary}"`,
    });
  } catch { return 0; }
}

/**
 * Notify on planning source mentions.
 */
export function notifyMentions(): number {
  try {
    const { getItemsWithMentions } = require("./planning-sources");
    const mentions = getItemsWithMentions();
    if (mentions.length === 0) return 0;

    const recent = mentions.slice(0, 3);
    const titles = recent.map((m: { title: string }) => m.title).join(", ");

    return notify({
      recipient: RECIPIENT,
      type: "change",
      title: "You were mentioned",
      message: `${mentions.length} planning doc(s) mention you/your team: ${titles}`,
    });
  } catch { return 0; }
}

/**
 * Run all notification triggers after a scan.
 * Lightweight — only creates notifications when conditions change.
 */
export function runScanNotifications(artifacts: Artifact[]): { hygieneId: number; staleId: number; contradictionId: number; mentionId: number } {
  return {
    hygieneId: notifyHygieneFindings(),
    staleId: notifyNewlyStale(artifacts),
    contradictionId: notifyContradictions(),
    mentionId: notifyMentions(),
  };
}
