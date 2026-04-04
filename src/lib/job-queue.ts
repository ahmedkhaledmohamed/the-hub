/**
 * SQLite-backed background job queue.
 *
 * Runs AI calls, webhook deliveries, and embedding generation
 * asynchronously without blocking HTTP requests.
 *
 * Jobs are persisted in SQLite so they survive restarts.
 * A single worker processes jobs sequentially with retry support.
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job {
  id: number;
  type: string;
  payload: string;
  status: JobStatus;
  result: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<string>;

// ── Schema ─────────────────────────────────────────────────────────

function ensureJobTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT NOT NULL,
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'pending',
      result       TEXT,
      error        TEXT,
      attempts     INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      started_at   TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
  `);
}

// ── Job creation ───────────────────────────────────────────────────

export function enqueueJob(type: string, payload: Record<string, unknown> = {}, maxAttempts = 3): number {
  ensureJobTable();
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO jobs (type, payload, max_attempts) VALUES (?, ?, ?)"
  ).run(type, JSON.stringify(payload), maxAttempts);
  return result.lastInsertRowid as number;
}

// ── Job retrieval ──────────────────────────────────────────────────

export function getNextPendingJob(): Job | null {
  ensureJobTable();
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM jobs WHERE status = 'pending' AND attempts < max_attempts ORDER BY created_at ASC LIMIT 1"
  ).get() as (Record<string, unknown>) | undefined;

  if (!row) return null;

  return {
    id: row.id as number,
    type: row.type as string,
    payload: row.payload as string,
    status: row.status as JobStatus,
    result: row.result as string | null,
    error: row.error as string | null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
  };
}

export function getJob(id: number): Job | null {
  ensureJobTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as (Record<string, unknown>) | undefined;
  if (!row) return null;

  return {
    id: row.id as number,
    type: row.type as string,
    payload: row.payload as string,
    status: row.status as JobStatus,
    result: row.result as string | null,
    error: row.error as string | null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
  };
}

export function getJobsByStatus(status: JobStatus, limit = 20): Job[] {
  ensureJobTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?"
  ).all(status, limit) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as number,
    type: row.type as string,
    payload: row.payload as string,
    status: row.status as JobStatus,
    result: row.result as string | null,
    error: row.error as string | null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
  }));
}

export function getJobCounts(): Record<JobStatus, number> {
  ensureJobTable();
  const db = getDb();
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM jobs GROUP BY status"
  ).all() as Array<{ status: string; count: number }>;

  const counts: Record<JobStatus, number> = { pending: 0, running: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    counts[row.status as JobStatus] = row.count;
  }
  return counts;
}

// ── Job state transitions ──────────────────────────────────────────

export function markJobRunning(id: number): void {
  ensureJobTable();
  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'running', started_at = datetime('now'), attempts = attempts + 1 WHERE id = ?"
  ).run(id);
}

export function markJobCompleted(id: number, result: string): void {
  ensureJobTable();
  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?"
  ).run(result, id);
}

export function markJobFailed(id: number, error: string): void {
  ensureJobTable();
  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?"
  ).run(error, id);
}

export function retryJob(id: number): void {
  ensureJobTable();
  const db = getDb();
  db.prepare(
    "UPDATE jobs SET status = 'pending', error = NULL WHERE id = ? AND attempts < max_attempts"
  ).run(id);
}

// ── Worker ─────────────────────────────────────────────────────────

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getRegisteredHandlers(): string[] {
  return Array.from(handlers.keys());
}

let workerRunning = false;
let workerInterval: ReturnType<typeof setInterval> | null = null;

export async function processNextJob(): Promise<boolean> {
  const job = getNextPendingJob();
  if (!job) return false;

  const handler = handlers.get(job.type);
  if (!handler) {
    markJobFailed(job.id, `No handler registered for job type: ${job.type}`);
    return true;
  }

  markJobRunning(job.id);

  try {
    const payload = JSON.parse(job.payload);
    const result = await handler(payload);
    markJobCompleted(job.id, result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (job.attempts + 1 >= job.maxAttempts) {
      markJobFailed(job.id, errorMsg);
    } else {
      // Reset to pending for retry
      retryJob(job.id);
    }
  }

  return true;
}

export function startWorker(intervalMs = 5000): void {
  if (workerRunning) return;
  workerRunning = true;

  workerInterval = setInterval(async () => {
    try {
      await processNextJob();
    } catch (err) {
      console.error("[job-queue] Worker error:", err);
    }
  }, intervalMs);

  if (workerInterval && typeof workerInterval === "object" && "unref" in workerInterval) {
    (workerInterval as NodeJS.Timeout).unref();
  }
}

export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  workerRunning = false;
}

export function isWorkerRunning(): boolean {
  return workerRunning;
}
