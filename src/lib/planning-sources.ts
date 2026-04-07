/**
 * Planning sources — pull content from external platforms and detect mentions.
 *
 * Configurable in hub.config.ts. Supports:
 * - Google Docs (folder listing)
 * - Confluence (space pages)
 * - Jira (JQL queries)
 * - Notion (database queries)
 * - GitHub (repo file paths)
 *
 * All pulled content is stored as artifacts and indexed via FTS5.
 * Mention detection scans for user/team/org patterns.
 */

import { getDb, persistArtifacts } from "./db";
import { loadConfig } from "./config";
import type { PlanningSourceConfig, Artifact } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface PlanningSourceItem {
  sourceId: string;
  remoteId: string;
  artifactPath: string;
  title: string;
  remoteUrl: string;
  lastSynced: string;
  mentions: string[];
}

export interface SyncResult {
  sourceId: string;
  label: string;
  type: string;
  itemsSynced: number;
  mentionsFound: number;
  error?: string;
}

export interface MentionMatch {
  artifactPath: string;
  title: string;
  sourceId: string;
  pattern: string;
  category: "self" | "team" | "org";
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS planning_source_items (
      source_id     TEXT NOT NULL,
      remote_id     TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      title         TEXT NOT NULL,
      remote_url    TEXT NOT NULL DEFAULT '',
      last_synced   TEXT NOT NULL DEFAULT (datetime('now')),
      mentions      TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (source_id, remote_id)
    );
    CREATE INDEX IF NOT EXISTS idx_psi_source ON planning_source_items(source_id);
    CREATE INDEX IF NOT EXISTS idx_psi_path ON planning_source_items(artifact_path);
  `);
}

// ── Mention Detection ──────────────────────────────────────────────

/**
 * Detect mentions of patterns in content. Case-insensitive.
 */
export function detectMentions(content: string, patterns: string[]): string[] {
  if (!content || patterns.length === 0) return [];
  const lower = content.toLowerCase();
  return patterns.filter((p) => lower.includes(p.toLowerCase()));
}

/**
 * Get all mention patterns from config (self + team + org).
 */
export function getAllMentionPatterns(): { pattern: string; category: "self" | "team" | "org" }[] {
  const config = loadConfig();
  const mentions = config.mentions || {};
  const patterns: { pattern: string; category: "self" | "team" | "org" }[] = [];
  for (const p of mentions.self || []) patterns.push({ pattern: p, category: "self" });
  for (const p of mentions.team || []) patterns.push({ pattern: p, category: "team" });
  for (const p of mentions.org || []) patterns.push({ pattern: p, category: "org" });
  return patterns;
}

// ── Source Fetchers ────────────────────────────────────────────────

interface FetchedItem {
  remoteId: string;
  title: string;
  content: string;
  remoteUrl: string;
}

/**
 * Fetch items from a Jira project via REST API.
 */
async function fetchJiraItems(config: PlanningSourceConfig): Promise<FetchedItem[]> {
  const baseUrl = config.baseUrl || process.env.JIRA_BASE_URL;
  const token = config.apiToken || process.env.JIRA_API_TOKEN;
  if (!baseUrl) throw new Error("No baseUrl configured and JIRA_BASE_URL not set");
  if (!token) throw new Error(`No API token — set apiToken in config or JIRA_API_TOKEN env var`);

  const jql = config.jql || `project = ${config.projectKey} AND type = Epic`;
  const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,description,status`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.authScheme === "cookie") headers["Cookie"] = token;
  else if (config.authScheme === "basic") headers["Authorization"] = `Basic ${token}`;
  else headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Jira returned ${res.status}: ${res.statusText}`);

  const data = await res.json() as { issues?: Array<{ key: string; fields: { summary: string; description?: string; status?: { name: string } } }> };
  return (data.issues || []).map((issue) => ({
    remoteId: issue.key,
    title: `${issue.key}: ${issue.fields.summary}`,
    content: `# ${issue.key}: ${issue.fields.summary}\n\nStatus: ${issue.fields.status?.name || "Unknown"}\n\n${issue.fields.description || "No description."}`,
    remoteUrl: `${baseUrl}/browse/${issue.key}`,
  }));
}

/**
 * Fetch pages from a Confluence space via REST API.
 */
async function fetchConfluenceItems(config: PlanningSourceConfig): Promise<FetchedItem[]> {
  const baseUrl = config.baseUrl || process.env.CONFLUENCE_BASE_URL;
  const token = config.apiToken || process.env.CONFLUENCE_API_TOKEN;
  if (!baseUrl) throw new Error("No baseUrl configured and CONFLUENCE_BASE_URL not set");
  if (!token) throw new Error("No API token — set apiToken in config or CONFLUENCE_API_TOKEN env var");

  const url = `${baseUrl}/rest/api/content?spaceKey=${config.spaceKey}&limit=50&expand=body.storage`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.authScheme === "cookie") headers["Cookie"] = token;
  else if (config.authScheme === "basic") headers["Authorization"] = `Basic ${token}`;
  else headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Confluence returned ${res.status}: ${res.statusText}`);

  const data = await res.json() as { results?: Array<{ id: string; title: string; body?: { storage?: { value: string } }; _links?: { webui?: string } }> };
  return (data.results || []).map((page) => {
    // Simple HTML to text conversion
    const html = page.body?.storage?.value || "";
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      remoteId: page.id,
      title: page.title,
      content: `# ${page.title}\n\n${text}`,
      remoteUrl: page._links?.webui ? `${baseUrl}${page._links.webui}` : "",
    };
  });
}

/**
 * Fetch docs from a Google Docs folder.
 * Reuses existing google-docs.ts integration if configured.
 */
async function fetchGoogleDocsItems(config: PlanningSourceConfig): Promise<FetchedItem[]> {
  try {
    const { isGoogleDocsConfigured, fetchDocContent } = require("./google-docs");
    if (!isGoogleDocsConfigured()) return [];

    // If folderId is specified, we'd need Drive API to list folder contents
    // For now, this fetches individual linked docs via existing integration
    const { getAllLinkedDocs } = require("./google-docs");
    const linked = getAllLinkedDocs();
    return linked.map((doc: { doc_id: string; title: string; artifact_path: string }) => ({
      remoteId: doc.doc_id,
      title: doc.title || doc.artifact_path,
      content: "", // Content is already synced via google-docs integration
      remoteUrl: `https://docs.google.com/document/d/${doc.doc_id}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch pages from a Notion database.
 */
async function fetchNotionItems(config: PlanningSourceConfig): Promise<FetchedItem[]> {
  try {
    const { isNotionConfigured, queryDatabase } = require("./notion-sync");
    if (!isNotionConfigured() || !config.databaseId) return [];

    const pages = queryDatabase(config.databaseId);
    return pages.map((p: { id: string; title: string; content: string; url: string }) => ({
      remoteId: p.id,
      title: p.title,
      content: p.content,
      remoteUrl: p.url || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch items written by an AI agent (Cursor / Claude Code) via MCP or file drop.
 * Reads from .hub-data/agent-sync/<sourceId>.json
 */
async function fetchAgentItems(config: PlanningSourceConfig): Promise<FetchedItem[]> {
  const fs = await import("fs");
  const path = await import("path");
  const hubDataDir = process.env.HUB_DATA_DIR || path.join(process.cwd(), ".hub-data");
  const filePath = path.join(hubDataDir, "agent-sync", `${config.id}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`No agent data found. Run sync_planning_sources from Cursor/Claude Code first.`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as { items: FetchedItem[]; syncedAt?: string };
  return data.items || [];
}

/**
 * Dispatch to the correct fetcher based on source type.
 */
async function fetchSourceItems(config: PlanningSourceConfig): Promise<FetchedItem[]> {
  switch (config.type) {
    case "jira": return fetchJiraItems(config);
    case "confluence": return fetchConfluenceItems(config);
    case "google-docs": return fetchGoogleDocsItems(config);
    case "notion": return fetchNotionItems(config);
    case "agent": return fetchAgentItems(config);
    default: return [];
  }
}

// ── Sync ───────────────────────────────────────────────────────────

/**
 * Sync a single planning source: fetch items, detect mentions, persist as artifacts.
 */
export async function syncPlanningSource(config: PlanningSourceConfig): Promise<SyncResult> {
  ensureTable();
  const db = getDb();
  const mentionPatterns = getAllMentionPatterns();
  const allPatterns = mentionPatterns.map((p) => p.pattern);
  const group = config.group || "planning";

  try {
    const items = await fetchSourceItems(config);

    const artifacts: Artifact[] = [];
    const contentMap = new Map<string, string>();
    let mentionsFound = 0;

    for (const item of items) {
      const artifactPath = `_sources/${config.id}/${item.remoteId.replace(/[^a-zA-Z0-9-]/g, "_")}`;
      const mentions = detectMentions(item.content + " " + item.title, allPatterns);
      if (mentions.length > 0) mentionsFound++;

      artifacts.push({
        path: artifactPath,
        title: item.title,
        type: "md",
        group,
        modifiedAt: new Date().toISOString(),
        size: item.content.length,
        staleDays: 0,
        snippet: item.content.slice(0, 200),
      });

      if (item.content) {
        contentMap.set(artifactPath, item.content);
      }

      // Upsert tracking record
      db.prepare(`
        INSERT INTO planning_source_items (source_id, remote_id, artifact_path, title, remote_url, mentions)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, remote_id) DO UPDATE SET
          title = excluded.title,
          remote_url = excluded.remote_url,
          last_synced = datetime('now'),
          mentions = excluded.mentions
      `).run(config.id, item.remoteId, artifactPath, item.title, item.remoteUrl, JSON.stringify(mentions));
    }

    // Persist as artifacts (indexed via FTS5)
    if (artifacts.length > 0) {
      persistArtifacts(artifacts, contentMap, { deleteStale: false });
    }

    return { sourceId: config.id, label: config.label, type: config.type, itemsSynced: items.length, mentionsFound };
  } catch (err) {
    return { sourceId: config.id, label: config.label, type: config.type, itemsSynced: 0, mentionsFound: 0, error: (err as Error).message };
  }
}

/**
 * Sync all enabled planning sources from config.
 */
export async function syncAllPlanningSources(): Promise<SyncResult[]> {
  const config = loadConfig();
  const sources = (config.planningSources || []).filter((s) => s.enabled !== false);
  if (sources.length === 0) return [];

  const results: SyncResult[] = [];
  for (const source of sources) {
    results.push(await syncPlanningSource(source));
  }
  return results;
}

// ── Queries ────────────────────────────────────────────────────────

/**
 * Get all tracked items for a source.
 */
export function getSourceItems(sourceId: string): PlanningSourceItem[] {
  ensureTable();
  const db = getDb();
  return (db.prepare("SELECT * FROM planning_source_items WHERE source_id = ? ORDER BY last_synced DESC").all(sourceId) as Array<Record<string, unknown>>).map((row) => ({
    sourceId: row.source_id as string,
    remoteId: row.remote_id as string,
    artifactPath: row.artifact_path as string,
    title: row.title as string,
    remoteUrl: row.remote_url as string,
    lastSynced: row.last_synced as string,
    mentions: JSON.parse((row.mentions as string) || "[]"),
  }));
}

/**
 * Get all items with mentions (across all sources).
 */
export function getItemsWithMentions(): PlanningSourceItem[] {
  ensureTable();
  const db = getDb();
  return (db.prepare("SELECT * FROM planning_source_items WHERE mentions != '[]' ORDER BY last_synced DESC").all() as Array<Record<string, unknown>>).map((row) => ({
    sourceId: row.source_id as string,
    remoteId: row.remote_id as string,
    artifactPath: row.artifact_path as string,
    title: row.title as string,
    remoteUrl: row.remote_url as string,
    lastSynced: row.last_synced as string,
    mentions: JSON.parse((row.mentions as string) || "[]"),
  }));
}

/**
 * Get sync status for all configured sources.
 */
export function getPlanningSourceStatus(): Array<{ id: string; label: string; type: string; itemCount: number; lastSynced: string | null }> {
  ensureTable();
  const config = loadConfig();
  const db = getDb();
  const sources = config.planningSources || [];

  return sources.map((s) => {
    const row = db.prepare("SELECT COUNT(*) as count, MAX(last_synced) as lastSynced FROM planning_source_items WHERE source_id = ?").get(s.id) as { count: number; lastSynced: string | null } | undefined;
    return {
      id: s.id,
      label: s.label,
      type: s.type,
      itemCount: row?.count || 0,
      lastSynced: row?.lastSynced || null,
    };
  });
}
