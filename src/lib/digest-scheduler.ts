/**
 * Scheduled Slack weekly digest — real cron-style execution.
 *
 * Runs the weekly digest on a configurable interval (default: every Monday 9am).
 * Posts to Slack if configured, otherwise stores results for API access.
 *
 * Configuration:
 *   HUB_DIGEST_INTERVAL_MS — Interval in ms (default: 7 days)
 *   HUB_DIGEST_ENABLED     — "true" to enable (default: disabled)
 */

import { generateWeeklyDigest, postWeeklyDigest } from "./weekly-digest";
import type { WeeklyDigest } from "./weekly-digest";

// ── Types ──────────────────────────────────────────────────────────

export interface DigestScheduleStatus {
  enabled: boolean;
  running: boolean;
  lastRun: string | null;
  lastResult: { sent: boolean; digest: WeeklyDigest } | null;
  nextRun: string | null;
  intervalMs: number;
  runCount: number;
}

// ── State ─────────────────────────────────────────────────────────

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastRun: string | null = null;
let lastResult: { sent: boolean; digest: WeeklyDigest } | null = null;
let startedAt: number | null = null;
let runCount = 0;

const DEFAULT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Scheduler ─────────────────────────────────────────────────────

/**
 * Start the digest scheduler.
 */
export function startDigestScheduler(options?: { intervalMs?: number; runImmediately?: boolean }): void {
  if (schedulerInterval) return; // Already running

  const intervalMs = options?.intervalMs || parseInt(process.env.HUB_DIGEST_INTERVAL_MS || String(DEFAULT_INTERVAL_MS), 10);
  startedAt = Date.now();

  // Schedule recurring runs
  schedulerInterval = setInterval(() => {
    runDigest();
  }, intervalMs);

  // Don't block Node from exiting
  if (schedulerInterval && typeof schedulerInterval === "object" && "unref" in schedulerInterval) {
    (schedulerInterval as NodeJS.Timeout).unref();
  }

  // Optionally run immediately
  if (options?.runImmediately) {
    runDigest();
  }

  try {
    const { hubLog } = require("./logger");
    hubLog("info", "system", "Digest scheduler started", { intervalMs });
  } catch { /* non-critical */ }
}

/**
 * Stop the digest scheduler.
 */
export function stopDigestScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    startedAt = null;
  }
}

/**
 * Check if the scheduler is enabled via config.
 */
export function isDigestEnabled(): boolean {
  return process.env.HUB_DIGEST_ENABLED === "true";
}

/**
 * Check if the scheduler is currently running.
 */
export function isDigestSchedulerActive(): boolean {
  return schedulerInterval !== null;
}

/**
 * Run the digest now (manual or scheduled).
 */
export async function runDigest(): Promise<{ sent: boolean; digest: WeeklyDigest }> {
  if (isRunning) {
    return lastResult || { sent: false, digest: generateWeeklyDigest(7) };
  }

  isRunning = true;
  try {
    const result = await postWeeklyDigest(7);
    lastRun = new Date().toISOString();
    lastResult = result;
    runCount++;

    try {
      const { hubLog } = require("./logger");
      hubLog("info", "system", "Weekly digest generated", {
        sent: result.sent,
        changes: result.digest.changes.modified,
        decisions: result.digest.decisions.new,
        stale: result.digest.stale.count,
      });
    } catch { /* non-critical */ }

    return result;
  } finally {
    isRunning = false;
  }
}

/**
 * Get scheduler status.
 */
export function getDigestScheduleStatus(): DigestScheduleStatus {
  const intervalMs = parseInt(process.env.HUB_DIGEST_INTERVAL_MS || String(DEFAULT_INTERVAL_MS), 10);
  return {
    enabled: isDigestEnabled(),
    running: isRunning,
    lastRun,
    lastResult,
    nextRun: lastRun ? new Date(new Date(lastRun).getTime() + intervalMs).toISOString() : null,
    intervalMs,
    runCount,
  };
}

/**
 * Reset scheduler state (for testing).
 */
export function resetDigestScheduler(): void {
  stopDigestScheduler();
  isRunning = false;
  lastRun = null;
  lastResult = null;
  startedAt = null;
  runCount = 0;
}

/**
 * Auto-start if enabled via environment.
 */
export function autoStartDigest(): void {
  if (isDigestEnabled() && !isDigestSchedulerActive()) {
    startDigestScheduler();
  }
}
