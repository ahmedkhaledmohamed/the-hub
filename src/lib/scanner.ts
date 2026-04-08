import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import type { HubConfig, Manifest, Artifact, ManifestGroup } from "./types";
import { getExtractor, getSupportedExtensions } from "./extractors";

const DEFAULT_SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".cursor", ".claude",
  "out", "dist", "build", "agent-transcripts",
]);

interface ScanFile {
  fullPath: string;
  relativePath: string;
  mtimeMs?: number;
  fileSize?: number;
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

  // Use configured extensions if provided, otherwise use all supported extensions
  const extensions = config.scanner?.extensions
    ? new Set(config.scanner.extensions)
    : new Set(getSupportedExtensions());
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
      // Only include if we have an extractor for it
      if (getExtractor(fullPath)) {
        results.push({ fullPath, relativePath, mtimeMs: stat.mtimeMs, fileSize: stat.size });
      }
    }
  }

  return results;
}

function humanName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  fileMtimes: Array<{ path: string; mtimeMs: number; size: number }>;
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
        mtimeMs: f.mtimeMs,
        fileSize: f.fileSize,
      });
    }
  }

  const snippetLen = config.scanner?.contentSnippetLength ?? 300;
  const now = Date.now();

  // Build contentMap in the same pass as artifact creation (avoid double file reads)
  const contentMap = options?.withContent ? new Map<string, string>() : null;

  const artifacts: Artifact[] = allFiles.map(({ fullPath, relativePath, mtimeMs, fileSize }) => {
    const extractor = getExtractor(fullPath);

    // Use preserved stat data from walk() instead of re-statting
    const mtime = mtimeMs ? new Date(mtimeMs) : new Date();
    const size = fileSize ?? 0;

    const staleDays = Math.floor((now - mtime.getTime()) / 86400000);

    // Read content once for extractors (skip binary files like PDFs)
    const isBinary = extractor?.artifactType === "pdf";
    const content = isBinary ? "" : readFileContent(fullPath);

    const title = extractor?.extractTitle(fullPath, content) || humanName(fullPath);
    const snippet = extractor?.extractSnippet(content, snippetLen);
    const artifactType = extractor?.artifactType || "html";

    // Populate contentMap in this same pass (no second read needed)
    if (contentMap) {
      const text = isBinary ? "" : (extractor?.extractText(content) || content);
      contentMap.set(relativePath, text);
    }

    return {
      path: relativePath,
      title,
      type: artifactType,
      group: getGroup(relativePath, config),
      modifiedAt: mtime.toISOString(),
      size,
      staleDays,
      snippet,
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

  if (options?.withContent && contentMap) {
    const fileMtimes = allFiles.map((f) => ({
      path: f.relativePath,
      mtimeMs: f.mtimeMs || 0,
      size: f.fileSize || 0,
    }));
    return { manifest, contentMap, fileMtimes };
  }

  return manifest;
}
