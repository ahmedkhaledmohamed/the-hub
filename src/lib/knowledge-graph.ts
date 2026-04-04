/**
 * Knowledge graph — explicit and auto-detected relationships between artifacts.
 *
 * Stores links in SQLite. Auto-parses [[wiki-style]] links from markdown.
 * Provides backlink lookups and graph data for visualization.
 */

import { getDb, getArtifactContent } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export type LinkType = "references" | "supersedes" | "related";

export interface ArtifactLink {
  sourcePath: string;
  targetPath: string;
  linkType: LinkType;
  createdAt: string;
}

export interface BacklinkInfo {
  path: string;
  title: string;
  linkType: LinkType;
}

export interface GraphNode {
  id: string;
  title: string;
  group: string;
  type: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  linkType: LinkType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Schema ─────────────────────────────────────────────────────────

function ensureLinksTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifact_links (
      source_path  TEXT NOT NULL,
      target_path  TEXT NOT NULL,
      link_type    TEXT NOT NULL DEFAULT 'references',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_path, target_path, link_type)
    );
    CREATE INDEX IF NOT EXISTS idx_links_target ON artifact_links(target_path);
  `);
}

// ── CRUD ───────────────────────────────────────────────────────────

export function addLink(sourcePath: string, targetPath: string, linkType: LinkType): void {
  ensureLinksTable();
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO artifact_links (source_path, target_path, link_type)
    VALUES (?, ?, ?)
  `).run(sourcePath, targetPath, linkType);
}

export function removeLink(sourcePath: string, targetPath: string, linkType: LinkType): void {
  ensureLinksTable();
  const db = getDb();
  db.prepare(
    "DELETE FROM artifact_links WHERE source_path = ? AND target_path = ? AND link_type = ?"
  ).run(sourcePath, targetPath, linkType);
}

export function getLinksFrom(sourcePath: string): ArtifactLink[] {
  ensureLinksTable();
  const db = getDb();
  return db.prepare(
    "SELECT source_path, target_path, link_type, created_at FROM artifact_links WHERE source_path = ?"
  ).all(sourcePath) as ArtifactLink[];
}

export function getBacklinks(targetPath: string): BacklinkInfo[] {
  ensureLinksTable();
  const db = getDb();
  const rows = db.prepare(`
    SELECT al.source_path, al.link_type, a.title
    FROM artifact_links al
    LEFT JOIN artifacts a ON a.path = al.source_path
    WHERE al.target_path = ?
    ORDER BY al.created_at DESC
  `).all(targetPath) as Array<{ source_path: string; link_type: string; title: string | null }>;

  return rows.map((r) => ({
    path: r.source_path,
    title: r.title || r.source_path.split("/").pop() || r.source_path,
    linkType: r.link_type as LinkType,
  }));
}

export function getLinkCount(): number {
  ensureLinksTable();
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM artifact_links").get() as { count: number };
  return row.count;
}

// ── Wiki-link parsing ──────────────────────────────────────────────

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function parseWikiLinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_REGEX.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

/**
 * Resolve a wiki-link target to an artifact path.
 * Tries exact match, then title match, then filename match.
 */
export function resolveWikiLink(target: string, allPaths: string[]): string | null {
  // Exact path match
  if (allPaths.includes(target)) return target;

  // Match by filename (without extension)
  const targetLower = target.toLowerCase();
  for (const p of allPaths) {
    const filename = p.split("/").pop()?.replace(/\.[^.]+$/, "") || "";
    if (filename.toLowerCase() === targetLower) return p;
  }

  // Partial path match
  for (const p of allPaths) {
    if (p.toLowerCase().includes(targetLower)) return p;
  }

  return null;
}

/**
 * Scan all markdown artifacts for wiki-links and create relationships.
 */
export function syncWikiLinks(artifacts: Array<{ path: string; type: string }>): { created: number; removed: number } {
  ensureLinksTable();
  const db = getDb();
  const allPaths = artifacts.map((a) => a.path);
  const mdArtifacts = artifacts.filter((a) => a.type === "md");

  let created = 0;
  let removed = 0;

  // Track which wiki-link relationships currently exist
  const currentWikiLinks = new Set<string>();

  for (const artifact of mdArtifacts) {
    const content = getArtifactContent(artifact.path);
    if (!content) continue;

    const wikiTargets = parseWikiLinks(content);
    for (const target of wikiTargets) {
      const resolved = resolveWikiLink(target, allPaths);
      if (resolved && resolved !== artifact.path) {
        const key = `${artifact.path}|${resolved}|references`;
        currentWikiLinks.add(key);
        addLink(artifact.path, resolved, "references");
        created++;
      }
    }
  }

  return { created, removed };
}

// ── Graph data ─────────────────────────────────────────────────────

export function getGraphData(): GraphData {
  ensureLinksTable();
  const db = getDb();

  // Get all linked artifacts
  const links = db.prepare(
    "SELECT source_path, target_path, link_type FROM artifact_links"
  ).all() as Array<{ source_path: string; target_path: string; link_type: string }>;

  // Collect all unique paths
  const pathSet = new Set<string>();
  for (const link of links) {
    pathSet.add(link.source_path);
    pathSet.add(link.target_path);
  }

  // Build nodes with metadata
  const getArtifact = db.prepare('SELECT title, "group", type FROM artifacts WHERE path = ?');
  const nodes: GraphNode[] = Array.from(pathSet).map((path) => {
    const artifact = getArtifact.get(path) as { title: string; group: string; type: string } | undefined;
    return {
      id: path,
      title: artifact?.title || path.split("/").pop() || path,
      group: artifact?.group || "other",
      type: artifact?.type || "unknown",
    };
  });

  const edges: GraphEdge[] = links.map((l) => ({
    source: l.source_path,
    target: l.target_path,
    linkType: l.link_type as LinkType,
  }));

  return { nodes, edges };
}
