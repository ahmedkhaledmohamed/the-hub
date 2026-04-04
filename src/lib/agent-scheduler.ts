/**
 * Agent scheduler — runs scheduled and event-driven workflows.
 *
 * Built-in workflow types:
 * - stale-doc-reminder: flags stale docs and drafts update suggestions
 * - weekly-summary: generates a status update from change feed data
 * - duplicate-resolver: auto-suggests consolidation for hygiene findings
 *
 * Agents use the AI client for generation and store results as notifications.
 */

import { getDb } from "./db";
import { getManifest } from "./manifest-store";
import { loadConfig } from "./config";
import { generate } from "./generator";
import { isAiConfigured } from "./ai-client";
import { computeChangeFeed, loadPreviousSnapshot } from "./change-feed";
import { analyzeHygiene } from "./hygiene-analyzer";
import type { AgentConfig, Manifest } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface AgentResult {
  agentId: string;
  type: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentStatus {
  id: string;
  type: string;
  enabled: boolean;
  lastRun: string | null;
  lastResult: string | null;
  runCount: number;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureAgentTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_results (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id   TEXT NOT NULL,
      type       TEXT NOT NULL,
      content    TEXT NOT NULL,
      metadata   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_results_id ON agent_results(agent_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      agent_id   TEXT PRIMARY KEY,
      last_run   TEXT NOT NULL DEFAULT (datetime('now')),
      run_count  INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ── Result storage ─────────────────────────────────────────────────

function storeResult(agentId: string, type: string, content: string, metadata?: Record<string, unknown>): void {
  ensureAgentTables();
  const db = getDb();
  db.prepare(
    "INSERT INTO agent_results (agent_id, type, content, metadata) VALUES (?, ?, ?, ?)"
  ).run(agentId, type, content, metadata ? JSON.stringify(metadata) : null);

  db.prepare(`
    INSERT INTO agent_runs (agent_id, last_run, run_count) VALUES (?, datetime('now'), 1)
    ON CONFLICT(agent_id) DO UPDATE SET last_run = datetime('now'), run_count = run_count + 1
  `).run(agentId);
}

export function getAgentResults(agentId?: string, limit = 10): AgentResult[] {
  ensureAgentTables();
  const db = getDb();

  if (agentId) {
    return db.prepare(
      "SELECT agent_id, type, content, metadata, created_at FROM agent_results WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(agentId, limit) as AgentResult[];
  }

  return db.prepare(
    "SELECT agent_id, type, content, metadata, created_at FROM agent_results ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as AgentResult[];
}

export function getAgentStatus(agentId: string): AgentStatus | null {
  ensureAgentTables();
  const db = getDb();
  const config = loadConfig();
  const agentConfig = config.agents?.find((a) => a.id === agentId);
  if (!agentConfig) return null;

  const run = db.prepare("SELECT last_run, run_count FROM agent_runs WHERE agent_id = ?")
    .get(agentId) as { last_run: string; run_count: number } | undefined;

  const lastResult = db.prepare(
    "SELECT content FROM agent_results WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(agentId) as { content: string } | undefined;

  return {
    id: agentId,
    type: agentConfig.type,
    enabled: agentConfig.enabled !== false,
    lastRun: run?.last_run || null,
    lastResult: lastResult?.content || null,
    runCount: run?.run_count || 0,
  };
}

// ── Built-in workflows ─────────────────────────────────────────────

async function runStaleDocReminder(agentId: string, options: Record<string, unknown>): Promise<string> {
  const manifest = getManifest();
  const threshold = (options.staleDays as number) || 30;
  const staleArtifacts = manifest.artifacts.filter((a) => a.staleDays > threshold);

  if (staleArtifacts.length === 0) {
    return "No stale documents found.";
  }

  const list = staleArtifacts.slice(0, 10).map(
    (a) => `- **${a.title}** (${a.staleDays} days stale) — ${a.path}`
  ).join("\n");

  const content = `## Stale Document Reminder\n\n${staleArtifacts.length} document(s) exceed the ${threshold}-day staleness threshold:\n\n${list}\n\n**Recommendation:** Review these documents and update or archive them.`;

  storeResult(agentId, "stale-doc-reminder", content, {
    staleCount: staleArtifacts.length,
    threshold,
  });

  return content;
}

async function runWeeklySummary(agentId: string): Promise<string> {
  if (!isAiConfigured()) {
    const content = "**Weekly summary skipped** — AI not configured.";
    storeResult(agentId, "weekly-summary", content);
    return content;
  }

  const result = await generate({ template: "status-update" });
  storeResult(agentId, "weekly-summary", result.content, {
    model: result.model,
    sourcePaths: result.sourcePaths,
  });

  return result.content;
}

async function runDuplicateResolver(agentId: string): Promise<string> {
  const manifest = getManifest();
  const report = analyzeHygiene(manifest.artifacts, manifest.generatedAt);
  const highFindings = report.findings.filter((f) => f.severity === "high");

  if (highFindings.length === 0) {
    const content = "No high-severity duplicates found.";
    storeResult(agentId, "duplicate-resolver", content);
    return content;
  }

  const list = highFindings.slice(0, 5).map((f) => {
    const paths = f.artifacts.map((a) => a.path).join(", ");
    return `- **${f.type}** (${Math.round((f.similarity || 0) * 100)}% match): ${paths}\n  Suggestion: ${f.suggestion}`;
  }).join("\n\n");

  const content = `## Duplicate Resolution Suggestions\n\n${highFindings.length} high-severity finding(s):\n\n${list}`;

  storeResult(agentId, "duplicate-resolver", content, {
    findingCount: highFindings.length,
  });

  return content;
}

// ── Main runner ────────────────────────────────────────────────────

export async function runAgent(agentId: string): Promise<string> {
  const config = loadConfig();
  const agentConfig = config.agents?.find((a) => a.id === agentId);

  if (!agentConfig) {
    throw new Error(`Agent "${agentId}" not found in config`);
  }

  if (agentConfig.enabled === false) {
    return `Agent "${agentId}" is disabled.`;
  }

  switch (agentConfig.type) {
    case "stale-doc-reminder":
      return runStaleDocReminder(agentId, agentConfig.options || {});
    case "weekly-summary":
      return runWeeklySummary(agentId);
    case "duplicate-resolver":
      return runDuplicateResolver(agentId);
    case "custom":
      return `Custom agent "${agentId}" — not yet implemented.`;
    default:
      throw new Error(`Unknown agent type: ${agentConfig.type}`);
  }
}

export async function runAllAgents(): Promise<AgentResult[]> {
  const config = loadConfig();
  const agents = config.agents || [];
  const results: AgentResult[] = [];

  for (const agent of agents) {
    if (agent.enabled === false) continue;
    try {
      const content = await runAgent(agent.id);
      results.push({
        agentId: agent.id,
        type: agent.type,
        content,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[agents] ${agent.id} failed:`, err);
    }
  }

  return results;
}

export function getConfiguredAgents(): AgentConfig[] {
  const config = loadConfig();
  return config.agents || [];
}
