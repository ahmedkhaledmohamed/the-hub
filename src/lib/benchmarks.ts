/**
 * Performance benchmarks — measure key operation timings.
 *
 * Provides benchmark functions for:
 * - Search latency (FTS5 query time)
 * - Manifest generation time
 * - Database query times
 * - Embedding lookup times
 *
 * Results are stored and queryable for regression detection.
 * Run via API or as part of the test suite.
 */

import { getDb, searchArtifacts, getArtifactCount } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface BenchmarkResult {
  name: string;
  durationMs: number;
  iterations: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface BenchmarkSuite {
  results: BenchmarkResult[];
  totalDurationMs: number;
  passedThresholds: boolean;
  failures: string[];
  timestamp: string;
}

// ── Timing utility ────────────────────────────────────────────────

function timeExecution(fn: () => void, iterations = 10): { durations: number[]; avgMs: number; minMs: number; maxMs: number; p95Ms: number } {
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const p95Idx = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);
  return {
    durations,
    avgMs: Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 100) / 100,
    minMs: Math.round(durations[0] * 100) / 100,
    maxMs: Math.round(durations[durations.length - 1] * 100) / 100,
    p95Ms: Math.round(durations[p95Idx] * 100) / 100,
  };
}

// ── Individual benchmarks ─────────────────────────────────────────

/**
 * Benchmark FTS5 search latency.
 */
export function benchmarkSearch(query = "test", iterations = 10): BenchmarkResult {
  const timing = timeExecution(() => {
    searchArtifacts(query, 20);
  }, iterations);

  return {
    name: "search_latency",
    durationMs: timing.durations.reduce((s, d) => s + d, 0),
    iterations,
    ...timing,
    metadata: { query, artifactCount: getArtifactCount() },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Benchmark artifact count query.
 */
export function benchmarkArtifactCount(iterations = 20): BenchmarkResult {
  const timing = timeExecution(() => {
    getArtifactCount();
  }, iterations);

  return {
    name: "artifact_count",
    durationMs: timing.durations.reduce((s, d) => s + d, 0),
    iterations,
    ...timing,
    metadata: { count: getArtifactCount() },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Benchmark SQLite table listing.
 */
export function benchmarkTableListing(iterations = 10): BenchmarkResult {
  const db = getDb();
  const timing = timeExecution(() => {
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  }, iterations);

  return {
    name: "table_listing",
    durationMs: timing.durations.reduce((s, d) => s + d, 0),
    iterations,
    ...timing,
    metadata: {},
    timestamp: new Date().toISOString(),
  };
}

/**
 * Benchmark manifest JSON serialization size.
 */
export function benchmarkManifestSize(): BenchmarkResult {
  const start = performance.now();
  let size = 0;
  try {
    const { getManifest } = require("./manifest-store");
    const manifest = getManifest();
    const json = JSON.stringify(manifest);
    size = new Blob([json]).size;
  } catch { /* manifest may not be available in test */ }
  const duration = performance.now() - start;

  return {
    name: "manifest_size",
    durationMs: Math.round(duration * 100) / 100,
    iterations: 1,
    avgMs: Math.round(duration * 100) / 100,
    minMs: Math.round(duration * 100) / 100,
    maxMs: Math.round(duration * 100) / 100,
    p95Ms: Math.round(duration * 100) / 100,
    metadata: { sizeBytes: size, sizeFormatted: formatSize(size) },
    timestamp: new Date().toISOString(),
  };
}

// ── Full suite ────────────────────────────────────────────────────

/**
 * Thresholds for performance regression detection.
 */
export const THRESHOLDS: Record<string, number> = {
  search_latency: 200,     // p95 < 200ms
  artifact_count: 10,      // p95 < 10ms
  table_listing: 50,       // p95 < 50ms
};

/**
 * Run the full benchmark suite and check against thresholds.
 */
export function runBenchmarkSuite(): BenchmarkSuite {
  const start = performance.now();
  const results: BenchmarkResult[] = [];
  const failures: string[] = [];

  results.push(benchmarkSearch());
  results.push(benchmarkArtifactCount());
  results.push(benchmarkTableListing());
  results.push(benchmarkManifestSize());

  // Check thresholds
  for (const result of results) {
    const threshold = THRESHOLDS[result.name];
    if (threshold && result.p95Ms > threshold) {
      failures.push(`${result.name}: p95 ${result.p95Ms}ms exceeds threshold ${threshold}ms`);
    }
  }

  return {
    results,
    totalDurationMs: Math.round((performance.now() - start) * 100) / 100,
    passedThresholds: failures.length === 0,
    failures,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format benchmark suite as readable text.
 */
export function formatBenchmarkReport(suite: BenchmarkSuite): string {
  const lines: string[] = [];
  lines.push(`**Performance Benchmark Report**`);
  lines.push(`Status: ${suite.passedThresholds ? "PASS" : "FAIL"} | Duration: ${suite.totalDurationMs}ms`);
  lines.push("");

  for (const r of suite.results) {
    const threshold = THRESHOLDS[r.name];
    const status = threshold ? (r.p95Ms <= threshold ? "✅" : "❌") : "ℹ️";
    lines.push(`${status} **${r.name}**: avg ${r.avgMs}ms, p95 ${r.p95Ms}ms, min ${r.minMs}ms, max ${r.maxMs}ms (${r.iterations} iterations)`);
    if (Object.keys(r.metadata).length > 0) {
      lines.push(`   ${JSON.stringify(r.metadata)}`);
    }
  }

  if (suite.failures.length > 0) {
    lines.push("");
    lines.push("**Failures:**");
    for (const f of suite.failures) lines.push(`  ❌ ${f}`);
  }

  return lines.join("\n");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
