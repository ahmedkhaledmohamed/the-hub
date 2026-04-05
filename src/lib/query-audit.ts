/**
 * Query plan audit — analyze SQLite query plans for optimization.
 *
 * Runs EXPLAIN QUERY PLAN on critical queries to detect:
 * - Full table scans (SCAN TABLE without index)
 * - Missing indexes on frequently-queried columns
 * - Suboptimal join strategies
 *
 * Also ensures critical indexes exist and creates them if missing.
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface QueryPlanResult {
  query: string;
  plan: string[];
  usesIndex: boolean;
  isFullScan: boolean;
  recommendation: string | null;
}

export interface AuditReport {
  queries: QueryPlanResult[];
  indexes: Array<{ table: string; name: string; columns: string }>;
  missingIndexes: string[];
  optimizations: string[];
  score: number; // 0-100
  generatedAt: string;
}

// ── Critical queries to audit ─────────────────────────────────────

const CRITICAL_QUERIES: Array<{ label: string; sql: string }> = [
  { label: "Search artifacts by path", sql: "EXPLAIN QUERY PLAN SELECT * FROM artifacts WHERE path = 'test'" },
  { label: "Search artifacts by group", sql: "EXPLAIN QUERY PLAN SELECT * FROM artifacts WHERE \"group\" = 'docs'" },
  { label: "Recent artifacts by stale_days", sql: "EXPLAIN QUERY PLAN SELECT * FROM artifacts WHERE stale_days <= 7 ORDER BY stale_days ASC LIMIT 20" },
  { label: "Decisions by status", sql: "EXPLAIN QUERY PLAN SELECT * FROM decisions WHERE status = 'active' ORDER BY extracted_at DESC" },
  { label: "Decisions by artifact_path", sql: "EXPLAIN QUERY PLAN SELECT * FROM decisions WHERE artifact_path = 'test'" },
  { label: "Annotations by artifact_path", sql: "EXPLAIN QUERY PLAN SELECT * FROM annotations WHERE artifact_path = 'test'" },
  { label: "Reviews by artifact_path", sql: "EXPLAIN QUERY PLAN SELECT * FROM review_requests WHERE artifact_path = 'test'" },
  { label: "Notifications by recipient", sql: "EXPLAIN QUERY PLAN SELECT * FROM notifications WHERE recipient = 'alice' AND read = 0" },
  { label: "Agent observations by session", sql: "EXPLAIN QUERY PLAN SELECT * FROM agent_observations WHERE session_id = 'test'" },
  { label: "Logs by category", sql: "EXPLAIN QUERY PLAN SELECT * FROM hub_logs WHERE category = 'scan' ORDER BY created_at DESC" },
  { label: "Errors by category", sql: "EXPLAIN QUERY PLAN SELECT * FROM hub_errors WHERE category = 'ai' AND resolved = 0" },
  { label: "Embeddings by path", sql: "EXPLAIN QUERY PLAN SELECT * FROM embeddings WHERE path = 'test'" },
];

// ── Required indexes ──────────────────────────────────────────────

const REQUIRED_INDEXES: Array<{ table: string; name: string; sql: string }> = [
  { table: "artifacts", name: "idx_artifacts_group", sql: 'CREATE INDEX IF NOT EXISTS idx_artifacts_group ON artifacts("group")' },
  { table: "artifacts", name: "idx_artifacts_stale", sql: "CREATE INDEX IF NOT EXISTS idx_artifacts_stale ON artifacts(stale_days)" },
  { table: "decisions", name: "idx_decisions_status", sql: "CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status)" },
  { table: "notifications", name: "idx_notif_recipient_read", sql: "CREATE INDEX IF NOT EXISTS idx_notif_recipient_read ON notifications(recipient, read)" },
  { table: "agent_observations", name: "idx_obs_session", sql: "CREATE INDEX IF NOT EXISTS idx_obs_session ON agent_observations(session_id)" },
  { table: "hub_logs", name: "idx_logs_category_time", sql: "CREATE INDEX IF NOT EXISTS idx_logs_category_time ON hub_logs(category, created_at)" },
  { table: "hub_errors", name: "idx_errors_cat_resolved", sql: "CREATE INDEX IF NOT EXISTS idx_errors_cat_resolved ON hub_errors(category, resolved)" },
];

// ── Audit ─────────────────────────────────────────────────────────

/**
 * Run EXPLAIN QUERY PLAN on a query and parse the result.
 */
export function analyzeQuery(sql: string): QueryPlanResult {
  const db = getDb();
  try {
    const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
    const planLines = rows.map((r) => String(r.detail || r.DETAIL || JSON.stringify(r)));

    const isFullScan = planLines.some((l) => l.includes("SCAN TABLE") && !l.includes("USING INDEX") && !l.includes("USING COVERING INDEX"));
    const usesIndex = planLines.some((l) => l.includes("USING INDEX") || l.includes("USING COVERING INDEX") || l.includes("SEARCH"));

    let recommendation: string | null = null;
    if (isFullScan) {
      recommendation = "Full table scan detected. Consider adding an index on the WHERE clause columns.";
    }

    return {
      query: sql.replace("EXPLAIN QUERY PLAN ", ""),
      plan: planLines,
      usesIndex,
      isFullScan,
      recommendation,
    };
  } catch {
    return {
      query: sql,
      plan: ["(table may not exist)"],
      usesIndex: false,
      isFullScan: false,
      recommendation: null,
    };
  }
}

/**
 * Get all existing indexes.
 */
export function getExistingIndexes(): Array<{ table: string; name: string; columns: string }> {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT tbl_name as table_name, name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name, name"
    ).all() as Array<{ table_name: string; name: string; sql: string }>;

    return rows.map((r) => ({
      table: r.table_name,
      name: r.name,
      columns: r.sql,
    }));
  } catch {
    return [];
  }
}

/**
 * Ensure all required indexes exist.
 */
export function ensureRequiredIndexes(): string[] {
  const db = getDb();
  const created: string[] = [];

  for (const idx of REQUIRED_INDEXES) {
    try {
      // Check if table exists first
      const tableExists = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(idx.table);

      if (tableExists) {
        db.exec(idx.sql);
        // Check if it was actually created (vs already existed)
        created.push(idx.name);
      }
    } catch { /* table or column may not exist */ }
  }

  return created;
}

/**
 * Run the full query plan audit.
 */
export function runQueryAudit(): AuditReport {
  const queries: QueryPlanResult[] = [];

  // Analyze critical queries
  for (const q of CRITICAL_QUERIES) {
    queries.push(analyzeQuery(q.sql));
  }

  // Ensure indexes
  ensureRequiredIndexes();

  // Get all indexes
  const indexes = getExistingIndexes();

  // Find missing indexes (required but not present)
  const existingNames = new Set(indexes.map((i) => i.name));
  const missingIndexes = REQUIRED_INDEXES
    .filter((r) => !existingNames.has(r.name))
    .map((r) => `${r.table}.${r.name}`);

  // Generate optimizations
  const optimizations: string[] = [];
  const fullScans = queries.filter((q) => q.isFullScan);
  if (fullScans.length > 0) {
    optimizations.push(`${fullScans.length} queries use full table scans — add indexes`);
  }
  if (missingIndexes.length > 0) {
    optimizations.push(`${missingIndexes.length} required index(es) could not be created`);
  }

  // Score: 100 - (full scans * 10) - (missing indexes * 5)
  const score = Math.max(0, 100 - (fullScans.length * 10) - (missingIndexes.length * 5));

  return {
    queries,
    indexes,
    missingIndexes,
    optimizations,
    score,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Format audit report as text.
 */
export function formatAuditReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`**Query Plan Audit** (score: ${report.score}/100)`);
  lines.push(`${report.indexes.length} indexes | ${report.queries.length} queries analyzed`);
  lines.push("");

  for (const q of report.queries) {
    const icon = q.isFullScan ? "⚠️" : q.usesIndex ? "✅" : "ℹ️";
    lines.push(`${icon} ${q.query.slice(0, 80)}`);
    if (q.recommendation) lines.push(`   → ${q.recommendation}`);
  }

  if (report.optimizations.length > 0) {
    lines.push("");
    lines.push("**Optimizations:**");
    for (const o of report.optimizations) lines.push(`  - ${o}`);
  }

  return lines.join("\n");
}
