/**
 * Notion real-time sync — bidirectional sync between Notion pages and Hub.
 *
 * Fetches Notion page content via the Notion API, converts rich text blocks
 * to markdown, and indexes as Hub artifacts. Tracks sync state per page
 * and supports database queries for bulk sync.
 *
 * Configuration:
 *   NOTION_TOKEN       — Notion integration token (Internal Integration)
 *   NOTION_DATABASE_ID — Optional database to sync all pages from
 */

import { getDb } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type NotionSyncStatus = "synced" | "local-ahead" | "remote-ahead" | "conflict" | "error";

export interface NotionPageLink {
  id: number;
  pageId: string;
  artifactPath: string;
  title: string;
  lastSyncedAt: string | null;
  lastEditedTime: string | null;
  status: NotionSyncStatus;
  remoteUrl: string;
  parentType: "page" | "database" | "workspace";
  parentId: string | null;
}

export interface NotionSyncResult {
  pageId: string;
  artifactPath: string;
  status: NotionSyncStatus;
  contentChanged: boolean;
  error?: string;
}

export interface NotionBlock {
  type: string;
  text?: string;
  children?: NotionBlock[];
  checked?: boolean;
  language?: string;
  url?: string;
  caption?: string;
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureNotionTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notion_page_links (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id           TEXT NOT NULL UNIQUE,
      artifact_path     TEXT NOT NULL,
      title             TEXT NOT NULL DEFAULT '',
      last_synced_at    TEXT,
      last_edited_time  TEXT,
      status            TEXT NOT NULL DEFAULT 'synced',
      remote_url        TEXT NOT NULL DEFAULT '',
      parent_type       TEXT NOT NULL DEFAULT 'page',
      parent_id         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notion_path ON notion_page_links(artifact_path);
    CREATE INDEX IF NOT EXISTS idx_notion_parent ON notion_page_links(parent_id);
  `);
}

// ── Row mapping ───────────────────────────────────────────────────

function rowToLink(row: Record<string, unknown>): NotionPageLink {
  return {
    id: row.id as number,
    pageId: row.page_id as string,
    artifactPath: row.artifact_path as string,
    title: row.title as string,
    lastSyncedAt: row.last_synced_at as string | null,
    lastEditedTime: row.last_edited_time as string | null,
    status: row.status as NotionSyncStatus,
    remoteUrl: row.remote_url as string,
    parentType: row.parent_type as "page" | "database" | "workspace",
    parentId: row.parent_id as string | null,
  };
}

// ── Configuration ─────────────────────────────────────────────────

export function isNotionConfigured(): boolean {
  return !!process.env.NOTION_TOKEN;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN || ""}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

// ── Notion API ────────────────────────────────────────────────────

/**
 * Parse a Notion page ID from a URL or return as-is.
 * Notion URLs: https://www.notion.so/workspace/Page-Title-{32-char-hex}
 * Or: https://www.notion.so/{32-char-hex}
 */
export function parsePageId(input: string): string {
  // Strip dashes from UUIDs for consistency
  const normalize = (id: string) => id.replace(/-/g, "");

  // Match 32-char hex at end of URL path
  const urlMatch = input.match(/([a-f0-9]{32})(?:\?|$)/i);
  if (urlMatch) return normalize(urlMatch[1]);

  // Match UUID format (with dashes)
  const uuidMatch = input.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  if (uuidMatch) return normalize(input);

  // Match 32-char hex (no dashes)
  const hexMatch = input.match(/^[a-f0-9]{32}$/i);
  if (hexMatch) return input;

  // Try extracting from longer URL with title prefix
  const longUrlMatch = input.match(/-([a-f0-9]{32})(?:\?|$)/i);
  if (longUrlMatch) return normalize(longUrlMatch[1]);

  return input;
}

/**
 * Fetch a Notion page's properties (title, last_edited_time, parent).
 */
export async function fetchPageMeta(
  pageId: string,
): Promise<{ title: string; lastEditedTime: string; parentType: string; parentId: string | null; url: string } | null> {
  if (!isNotionConfigured()) return null;

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: getHeaders() });
    if (!res.ok) return null;

    const page = (await res.json()) as Record<string, unknown>;
    const props = page.properties as Record<string, unknown> | undefined;
    let title = pageId;

    // Extract title from properties — could be "title" or "Name" type
    if (props) {
      for (const val of Object.values(props)) {
        const prop = val as Record<string, unknown>;
        if (prop.type === "title" && Array.isArray(prop.title)) {
          title = (prop.title as Array<{ plain_text: string }>).map((t) => t.plain_text).join("");
          break;
        }
      }
    }

    const parent = page.parent as Record<string, unknown> | undefined;
    let parentType = "workspace";
    let parentId: string | null = null;
    if (parent) {
      if (parent.database_id) { parentType = "database"; parentId = parent.database_id as string; }
      else if (parent.page_id) { parentType = "page"; parentId = parent.page_id as string; }
    }

    return {
      title,
      lastEditedTime: (page.last_edited_time as string) || new Date().toISOString(),
      parentType,
      parentId,
      url: (page.url as string) || `https://notion.so/${pageId}`,
    };
  } catch (err) {
    try { const { reportError } = require("./error-reporter"); reportError("integration", err, { integration: "notion", pageId }); } catch { /* non-critical */ }
    return null;
  }
}

/**
 * Fetch all blocks (content) for a Notion page.
 */
export async function fetchPageBlocks(pageId: string): Promise<NotionBlock[]> {
  if (!isNotionConfigured()) return [];

  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      headers: getHeaders(),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { results: Array<Record<string, unknown>> };
    return data.results.map(apiBlockToNotionBlock);
  } catch {
    return [];
  }
}

function apiBlockToNotionBlock(block: Record<string, unknown>): NotionBlock {
  const type = block.type as string;
  const content = block[type] as Record<string, unknown> | undefined;

  const result: NotionBlock = { type };

  if (content) {
    // Extract rich text
    const richText = content.rich_text as Array<{ plain_text: string }> | undefined;
    if (richText) {
      result.text = richText.map((t) => t.plain_text).join("");
    }

    // Code blocks
    if (content.language) result.language = content.language as string;

    // To-do items
    if (typeof content.checked === "boolean") result.checked = content.checked;

    // Images, files
    if (type === "image" || type === "file") {
      const file = content.file as Record<string, unknown> | undefined;
      const external = content.external as Record<string, unknown> | undefined;
      result.url = (file?.url as string) || (external?.url as string) || "";
      const caption = content.caption as Array<{ plain_text: string }> | undefined;
      if (caption) result.caption = caption.map((t) => t.plain_text).join("");
    }
  }

  return result;
}

// ── Markdown conversion ───────────────────────────────────────────

/**
 * Convert Notion blocks to markdown.
 */
export function blocksToMarkdown(blocks: NotionBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        lines.push(block.text || "");
        lines.push("");
        break;
      case "heading_1":
        lines.push(`# ${block.text || ""}`);
        lines.push("");
        break;
      case "heading_2":
        lines.push(`## ${block.text || ""}`);
        lines.push("");
        break;
      case "heading_3":
        lines.push(`### ${block.text || ""}`);
        lines.push("");
        break;
      case "bulleted_list_item":
        lines.push(`- ${block.text || ""}`);
        break;
      case "numbered_list_item":
        lines.push(`1. ${block.text || ""}`);
        break;
      case "to_do":
        lines.push(`- [${block.checked ? "x" : " "}] ${block.text || ""}`);
        break;
      case "code":
        lines.push(`\`\`\`${block.language || ""}`);
        lines.push(block.text || "");
        lines.push("```");
        lines.push("");
        break;
      case "quote":
        lines.push(`> ${block.text || ""}`);
        lines.push("");
        break;
      case "divider":
        lines.push("---");
        lines.push("");
        break;
      case "callout":
        lines.push(`> **Note:** ${block.text || ""}`);
        lines.push("");
        break;
      case "toggle":
        lines.push(`<details><summary>${block.text || ""}</summary>`);
        lines.push("");
        if (block.children) lines.push(blocksToMarkdown(block.children));
        lines.push("</details>");
        lines.push("");
        break;
      case "image":
        lines.push(`![${block.caption || "image"}](${block.url || ""})`);
        lines.push("");
        break;
      case "bookmark":
      case "link_preview":
        lines.push(`[${block.text || block.url || "link"}](${block.url || ""})`);
        lines.push("");
        break;
      default:
        if (block.text) {
          lines.push(block.text);
          lines.push("");
        }
        break;
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Link management ───────────────────────────────────────────────

export function linkPage(opts: {
  pageId: string;
  artifactPath: string;
  title?: string;
  parentType?: "page" | "database" | "workspace";
  parentId?: string | null;
}): number {
  ensureNotionTable();
  const db = getDb();
  const remoteUrl = `https://notion.so/${opts.pageId}`;

  const existing = db.prepare("SELECT id FROM notion_page_links WHERE page_id = ?").get(opts.pageId) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE notion_page_links SET artifact_path = ?, title = ?, remote_url = ?, parent_type = ?, parent_id = ? WHERE page_id = ?",
    ).run(opts.artifactPath, opts.title || "", remoteUrl, opts.parentType || "page", opts.parentId || null, opts.pageId);
    return existing.id;
  }

  const result = db.prepare(
    "INSERT INTO notion_page_links (page_id, artifact_path, title, remote_url, parent_type, parent_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(opts.pageId, opts.artifactPath, opts.title || "", remoteUrl, opts.parentType || "page", opts.parentId || null);
  return result.lastInsertRowid as number;
}

export function unlinkPage(pageId: string): boolean {
  ensureNotionTable();
  const db = getDb();
  const result = db.prepare("DELETE FROM notion_page_links WHERE page_id = ?").run(pageId);
  return result.changes > 0;
}

export function getLinkedPage(pageId: string): NotionPageLink | null {
  ensureNotionTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM notion_page_links WHERE page_id = ?").get(pageId) as Record<string, unknown> | undefined;
  return row ? rowToLink(row) : null;
}

export function getLinkedPageByPath(artifactPath: string): NotionPageLink | null {
  ensureNotionTable();
  const db = getDb();
  const row = db.prepare("SELECT * FROM notion_page_links WHERE artifact_path = ?").get(artifactPath) as Record<string, unknown> | undefined;
  return row ? rowToLink(row) : null;
}

export function getAllLinkedPages(): NotionPageLink[] {
  ensureNotionTable();
  const db = getDb();
  return (db.prepare("SELECT * FROM notion_page_links ORDER BY title ASC").all() as Record<string, unknown>[]).map(rowToLink);
}

export function getLinkedPagesByParent(parentId: string): NotionPageLink[] {
  ensureNotionTable();
  const db = getDb();
  return (db.prepare(
    "SELECT * FROM notion_page_links WHERE parent_id = ? ORDER BY title ASC",
  ).all(parentId) as Record<string, unknown>[]).map(rowToLink);
}

// ── Sync operations ───────────────────────────────────────────────

/**
 * Pull a Notion page's content and update the sync record.
 */
export async function pullPage(pageId: string): Promise<NotionSyncResult> {
  ensureNotionTable();
  const link = getLinkedPage(pageId);
  if (!link) {
    return { pageId, artifactPath: "", status: "error", contentChanged: false, error: "Page not linked" };
  }

  const meta = await fetchPageMeta(pageId);
  if (!meta) {
    updateSyncStatus(pageId, "error");
    return { pageId, artifactPath: link.artifactPath, status: "error", contentChanged: false, error: "Failed to fetch metadata" };
  }

  const blocks = await fetchPageBlocks(pageId);
  if (blocks.length === 0) {
    updateSyncStatus(pageId, "error");
    return { pageId, artifactPath: link.artifactPath, status: "error", contentChanged: false, error: "No content blocks" };
  }

  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    "UPDATE notion_page_links SET last_synced_at = ?, last_edited_time = ?, status = 'synced', title = ? WHERE page_id = ?",
  ).run(now, meta.lastEditedTime, meta.title, pageId);

  return { pageId, artifactPath: link.artifactPath, status: "synced", contentChanged: true };
}

/**
 * Sync all linked Notion pages.
 */
export async function syncAllPages(): Promise<NotionSyncResult[]> {
  const links = getAllLinkedPages();
  const results: NotionSyncResult[] = [];
  for (const link of links) {
    const result = await pullPage(link.pageId);
    results.push(result);
  }
  return results;
}

function updateSyncStatus(pageId: string, status: NotionSyncStatus): void {
  const db = getDb();
  db.prepare("UPDATE notion_page_links SET status = ? WHERE page_id = ?").run(status, pageId);
}

// ── Database query ────────────────────────────────────────────────

/**
 * Query a Notion database and return page IDs + titles.
 * Useful for bulk-linking all pages in a database.
 */
export async function queryDatabase(
  databaseId: string,
): Promise<Array<{ pageId: string; title: string; lastEditedTime: string }>> {
  if (!isNotionConfigured()) return [];

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ page_size: 100 }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { results: Array<Record<string, unknown>> };
    return data.results.map((page) => {
      const props = page.properties as Record<string, unknown>;
      let title = "";
      if (props) {
        for (const val of Object.values(props)) {
          const prop = val as Record<string, unknown>;
          if (prop.type === "title" && Array.isArray(prop.title)) {
            title = (prop.title as Array<{ plain_text: string }>).map((t) => t.plain_text).join("");
            break;
          }
        }
      }
      return {
        pageId: (page.id as string).replace(/-/g, ""),
        title,
        lastEditedTime: (page.last_edited_time as string) || "",
      };
    });
  } catch {
    return [];
  }
}

// ── Summary ───────────────────────────────────────────────────────

export function getNotionSyncSummary(): {
  total: number;
  synced: number;
  errors: number;
  byParentType: Record<string, number>;
} {
  ensureNotionTable();
  const links = getAllLinkedPages();
  const byParentType: Record<string, number> = {};
  for (const l of links) {
    byParentType[l.parentType] = (byParentType[l.parentType] || 0) + 1;
  }
  return {
    total: links.length,
    synced: links.filter((l) => l.status === "synced").length,
    errors: links.filter((l) => l.status === "error").length,
    byParentType,
  };
}
