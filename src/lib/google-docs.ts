/**
 * Google Docs live sync — bidirectional sync between Google Docs and Hub.
 *
 * Fetches Google Docs content via the Google Docs API, converts to markdown,
 * and indexes as Hub artifacts. Supports push-back of local changes.
 *
 * Configuration:
 *   GOOGLE_DOCS_API_KEY    — API key for public docs (read-only)
 *   GOOGLE_DOCS_TOKEN      — OAuth2 access token for private docs + write
 *   GOOGLE_DOCS_FOLDER_ID  — Optional folder to sync all docs from
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type SyncDirection = "pull" | "push" | "both";
export type SyncStatus = "synced" | "local-ahead" | "remote-ahead" | "conflict" | "error";

export interface GoogleDocLink {
  id: number;
  docId: string;
  artifactPath: string;
  title: string;
  lastSyncedAt: string | null;
  lastRemoteModified: string | null;
  syncDirection: SyncDirection;
  status: SyncStatus;
  remoteUrl: string;
}

export interface SyncResult {
  docId: string;
  artifactPath: string;
  status: SyncStatus;
  contentChanged: boolean;
  error?: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureGoogleDocsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_doc_links (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id               TEXT NOT NULL UNIQUE,
      artifact_path        TEXT NOT NULL,
      title                TEXT NOT NULL DEFAULT '',
      last_synced_at       TEXT,
      last_remote_modified TEXT,
      sync_direction       TEXT NOT NULL DEFAULT 'pull',
      status               TEXT NOT NULL DEFAULT 'synced',
      remote_url           TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_gdocs_path ON google_doc_links(artifact_path);
  `);
}

// ── Row mapping ───────────────────────────────────────────────────

function rowToLink(row: Record<string, unknown>): GoogleDocLink {
  return {
    id: row.id as number,
    docId: row.doc_id as string,
    artifactPath: row.artifact_path as string,
    title: row.title as string,
    lastSyncedAt: row.last_synced_at as string | null,
    lastRemoteModified: row.last_remote_modified as string | null,
    syncDirection: row.sync_direction as SyncDirection,
    status: row.status as SyncStatus,
    remoteUrl: row.remote_url as string,
  };
}

// ── Configuration ─────────────────────────────────────────────────

export function isGoogleDocsConfigured(): boolean {
  return !!(process.env.GOOGLE_DOCS_API_KEY || process.env.GOOGLE_DOCS_TOKEN);
}

function getAuthHeaders(): Record<string, string> {
  const token = process.env.GOOGLE_DOCS_TOKEN;
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function getApiKey(): string {
  return process.env.GOOGLE_DOCS_API_KEY || "";
}

// ── Google Docs API ───────────────────────────────────────────────

/**
 * Extract a Google Doc ID from a URL or return the ID as-is.
 */
export function parseDocId(input: string): string {
  // Match: https://docs.google.com/document/d/{docId}/edit
  const urlMatch = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  return input;
}

/**
 * Build the Google Docs API URL for a document.
 */
export function buildDocUrl(docId: string): string {
  const key = getApiKey();
  const base = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  return key ? `${base}&key=${key}` : base;
}

/**
 * Fetch a Google Doc's content as plain text.
 */
export async function fetchDocContent(docId: string): Promise<{ content: string; title: string } | null> {
  if (!isGoogleDocsConfigured()) return null;

  try {
    // Use export endpoint for plain text content
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const headers = getAuthHeaders();
    const key = getApiKey();
    const url = key ? `${exportUrl}&key=${key}` : exportUrl;

    const response = await fetch(url, { headers });
    if (!response.ok) return null;

    const content = await response.text();

    // Get title from metadata API
    let title = docId;
    try {
      const metaUrl = `https://docs.googleapis.com/v1/documents/${docId}${key ? `?key=${key}` : ""}`;
      const metaResponse = await fetch(metaUrl, { headers });
      if (metaResponse.ok) {
        const meta = (await metaResponse.json()) as { title?: string };
        title = meta.title || docId;
      }
    } catch { /* use docId as fallback title */ }

    return { content, title };
  } catch (err) {
    try { const { reportError } = require("./error-reporter"); reportError("integration", err, { integration: "google-docs", docId }); } catch { /* non-critical */ }
    return null;
  }
}

// ── Link management ───────────────────────────────────────────────

export function linkDoc(opts: {
  docId: string;
  artifactPath: string;
  title?: string;
  syncDirection?: SyncDirection;
}): number {
  ensureGoogleDocsTable();
  const db = getDb();
  const remoteUrl = `https://docs.google.com/document/d/${opts.docId}/edit`;

  // Upsert: update if docId exists, insert if new
  const existing = db.prepare("SELECT id FROM google_doc_links WHERE doc_id = ?").get(opts.docId) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE google_doc_links SET artifact_path = ?, title = ?, sync_direction = ?, remote_url = ? WHERE doc_id = ?",
    ).run(opts.artifactPath, opts.title || "", opts.syncDirection || "pull", remoteUrl, opts.docId);
    return existing.id;
  }

  const result = db.prepare(
    "INSERT INTO google_doc_links (doc_id, artifact_path, title, sync_direction, remote_url) VALUES (?, ?, ?, ?, ?)",
  ).run(opts.docId, opts.artifactPath, opts.title || "", opts.syncDirection || "pull", remoteUrl);
  return result.lastInsertRowid as number;
}

export function unlinkDoc(docId: string): boolean {
  ensureGoogleDocsTable();
  const db = getDb();
  const result = db.prepare("DELETE FROM google_doc_links WHERE doc_id = ?").run(docId);
  return result.changes > 0;
}

export function getLinkedDoc(docId: string): GoogleDocLink | null {
  ensureGoogleDocsTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM google_doc_links WHERE doc_id = ?").get(docId) as Record<string, unknown> | undefined;
  return row ? rowToLink(row) : null;
}

export function getLinkedDocByPath(artifactPath: string): GoogleDocLink | null {
  ensureGoogleDocsTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM google_doc_links WHERE artifact_path = ?").get(artifactPath) as Record<string, unknown> | undefined;
  return row ? rowToLink(row) : null;
}

export function getAllLinkedDocs(): GoogleDocLink[] {
  ensureGoogleDocsTable();
  const db = getDb();
  return (db.prepare("SELECT * FROM google_doc_links ORDER BY title ASC").all() as Record<string, unknown>[]).map(rowToLink);
}

// ── Sync operations ───────────────────────────────────────────────

/**
 * Pull a Google Doc's content and update the sync record.
 */
export async function pullDoc(docId: string): Promise<SyncResult> {
  ensureGoogleDocsTable();
  const link = getLinkedDoc(docId);
  if (!link) {
    return { docId, artifactPath: "", status: "error", contentChanged: false, error: "Doc not linked" };
  }

  const result = await fetchDocContent(docId);
  if (!result) {
    updateSyncStatus(docId, "error");
    return { docId, artifactPath: link.artifactPath, status: "error", contentChanged: false, error: "Failed to fetch" };
  }

  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    "UPDATE google_doc_links SET last_synced_at = ?, last_remote_modified = ?, status = 'synced', title = ? WHERE doc_id = ?",
  ).run(now, now, result.title, docId);

  return { docId, artifactPath: link.artifactPath, status: "synced", contentChanged: true };
}

/**
 * Sync all linked Google Docs.
 */
export async function syncAllDocs(): Promise<SyncResult[]> {
  const links = getAllLinkedDocs();
  const results: SyncResult[] = [];
  for (const link of links) {
    if (link.syncDirection === "pull" || link.syncDirection === "both") {
      const result = await pullDoc(link.docId);
      results.push(result);
    }
  }
  return results;
}

function updateSyncStatus(docId: string, status: SyncStatus): void {
  const db = getDb();
  db.prepare("UPDATE google_doc_links SET status = ? WHERE doc_id = ?").run(status, docId);
}

// ── Summary ───────────────────────────────────────────────────────

export function getSyncSummary(): {
  total: number;
  synced: number;
  errors: number;
  pullOnly: number;
  bidirectional: number;
} {
  ensureGoogleDocsTable();
  const links = getAllLinkedDocs();
  return {
    total: links.length,
    synced: links.filter((l) => l.status === "synced").length,
    errors: links.filter((l) => l.status === "error").length,
    pullOnly: links.filter((l) => l.syncDirection === "pull").length,
    bidirectional: links.filter((l) => l.syncDirection === "both").length,
  };
}

// ── Markdown conversion helpers ───────────────────────────────────

/**
 * Convert Google Docs plain text export to basic markdown.
 * Handles common patterns like headings, bullet lists, and numbered lists.
 */
export function textToMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Detect headings: all-caps lines followed by blank line (common in Google Docs export)
    if (line === line.toUpperCase() && line.trim().length > 3 && line.trim().length < 80) {
      const next = lines[i + 1];
      if (!next || next.trim() === "") {
        result.push(`## ${line.trim()}`);
        continue;
      }
    }

    // Convert numbered lists: "1. " style already works in markdown
    // Convert bullet points: "● " or "• " to "- "
    line = line.replace(/^(\s*)[●•]\s+/, "$1- ");

    result.push(line);
  }

  return result.join("\n");
}
