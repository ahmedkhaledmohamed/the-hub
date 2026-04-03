import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import type { HubConfig, Manifest, Artifact, ManifestGroup } from "./types";

const DEFAULT_EXTENSIONS = new Set([".html", ".svg", ".md", ".csv"]);
const DEFAULT_SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".cursor", ".claude",
  "out", "dist", "build", "agent-transcripts",
]);

interface ScanFile {
  fullPath: string;
  relativePath: string;
}

function shouldSkipDir(name: string, config: HubConfig): boolean {
  const skipDirs = new Set(config.scanner?.skipDirs ?? DEFAULT_SKIP_DIRS);
  return skipDirs.has(name) || name.startsWith(".");
}

function walk(
  dir: string,
  baseDir: string,
  prefix: string,
  config: HubConfig,
  results: ScanFile[] = [],
): ScanFile[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results;
  }

  const extensions = new Set(config.scanner?.extensions ?? DEFAULT_EXTENSIONS);
  const skipPaths = config.scanner?.skipPaths ?? [];

  for (const name of entries) {
    if (shouldSkipDir(name, config)) continue;

    const fullPath = path.join(dir, name);
    const relativePath = prefix
      ? `${prefix}/${path.relative(baseDir, fullPath)}`
      : path.relative(baseDir, fullPath);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (skipPaths.some((p) => relativePath === p || relativePath.startsWith(p + "/"))) continue;
      walk(fullPath, baseDir, prefix, config, results);
    } else if (stat.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (!extensions.has(ext)) continue;
      if (skipPaths.some((p) => relativePath === p)) continue;
      results.push({ fullPath, relativePath });
    }
  }

  return results;
}

function extractTitle(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf8").slice(0, 2000);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".html") {
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) return titleMatch[1].trim();
      const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) return h1Match[1].trim();
    }

    if (ext === ".md") {
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) return h1Match[1].replace(/[*_`]/g, "").trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function extractSnippet(filePath: string, maxLen: number): string | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf8").slice(0, maxLen * 3);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".md") {
      const lines = content.split("\n").filter(
        (l) => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("```"),
      );
      return lines.slice(0, 5).join(" ").slice(0, maxLen) || undefined;
    }

    if (ext === ".html") {
      const stripped = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return stripped.slice(0, maxLen) || undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function humanName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getType(filePath: string): Artifact["type"] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "svg";
  if (ext === ".md") return "md";
  if (ext === ".csv") return "csv";
  return "html";
}

function matchesPattern(relativePath: string, pattern: string | string[]): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((p) => minimatch(relativePath, p, { dot: false }));
}

function getGroup(relativePath: string, config: HubConfig): string {
  for (const g of config.groups) {
    if (matchesPattern(relativePath, g.match)) return g.id;
  }
  return "other";
}

export function readFileContent(fullPath: string): string {
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch {
    return "";
  }
}

export interface ScanResult {
  manifest: Manifest;
  contentMap: Map<string, string>;
}

export function scan(config: HubConfig): Manifest;
export function scan(config: HubConfig, options: { withContent: true }): ScanResult;
export function scan(config: HubConfig, options?: { withContent?: boolean }): Manifest | ScanResult {
  const allFiles: ScanFile[] = [];

  for (const workspace of config.workspaces) {
    const wsPath = workspace.path;
    try {
      if (!fs.statSync(wsPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const prefix = path.basename(wsPath);
    const files = walk(wsPath, wsPath, "", config);

    for (const f of files) {
      allFiles.push({
        fullPath: f.fullPath,
        relativePath: prefix + "/" + f.relativePath,
      });
    }
  }

  const snippetLen = config.scanner?.contentSnippetLength ?? 300;
  const now = Date.now();

  const artifacts: Artifact[] = allFiles.map(({ fullPath, relativePath }) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      stat = { mtime: new Date(), size: 0 } as fs.Stats;
    }

    const staleDays = Math.floor((now - stat.mtime.getTime()) / 86400000);

    return {
      path: relativePath,
      title: extractTitle(fullPath) || humanName(fullPath),
      type: getType(fullPath),
      group: getGroup(relativePath, config),
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size,
      staleDays,
      snippet: extractSnippet(fullPath, snippetLen),
    };
  });

  // Sort: by group order, then by recency within group
  const groupOrder = config.groups.map((g) => g.id);
  artifacts.sort((a, b) => {
    const ai = groupOrder.indexOf(a.group);
    const bi = groupOrder.indexOf(b.group);
    const aIdx = ai === -1 ? 999 : ai;
    const bIdx = bi === -1 ? 999 : bi;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });

  // Build group summaries
  const groupCounts = new Map<string, number>();
  for (const a of artifacts) {
    groupCounts.set(a.group, (groupCounts.get(a.group) || 0) + 1);
  }

  const groups: ManifestGroup[] = [];
  for (const g of config.groups) {
    const count = groupCounts.get(g.id) || 0;
    if (count === 0) continue;
    groups.push({
      id: g.id,
      label: g.label,
      description: g.description || "",
      color: g.color || "#666",
      tab: g.tab,
      count,
    });
  }

  // Add "other" group if there are uncategorized artifacts
  const otherCount = groupCounts.get("other") || 0;
  if (otherCount > 0) {
    groups.push({
      id: "other",
      label: "Other",
      description: "Uncategorized artifacts",
      color: "#666",
      tab: "all",
      count: otherCount,
    });
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    workspaces: config.workspaces.map((w) => w.path),
    groups,
    artifacts,
  };

  if (options?.withContent) {
    const contentMap = new Map<string, string>();
    for (const { fullPath, relativePath } of allFiles) {
      contentMap.set(relativePath, readFileContent(fullPath));
    }
    return { manifest, contentMap };
  }

  return manifest;
}
