import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";
import type { Manifest, ManifestSnapshot, ChangeFeedEntry, DiffLine } from "./types";
import { contentHash } from "./db";
import { readFileContent } from "./scanner";
import { loadConfig, getResolvedWorkspacePaths } from "./config";
import { basename, resolve } from "path";

const DATA_DIR = join(process.cwd(), ".hub-data");
const SNAPSHOT_FILE = join(DATA_DIR, "previous-manifest.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function resolveArtifactPath(artifactPath: string): string {
  const config = loadConfig();
  const segments = artifactPath.split("/");
  const wsLabel = segments[0];
  const rest = segments.slice(1).join("/");

  for (const ws of config.workspaces) {
    const wsName = basename(ws.path.replace(/^~\//, ""));
    if (wsName === wsLabel || ws.label === wsLabel) {
      const resolved = ws.path.startsWith("~/")
        ? resolve(process.env.HOME || "/", ws.path.slice(2))
        : resolve(ws.path);
      return resolve(resolved, rest);
    }
  }
  const wsPaths = getResolvedWorkspacePaths(config);
  return resolve(wsPaths[0] || ".", rest);
}

export function saveSnapshot(manifest: Manifest): void {
  ensureDataDir();
  const snapshot: ManifestSnapshot = {
    generatedAt: manifest.generatedAt,
    artifacts: {},
    hashes: {},
  };
  for (const a of manifest.artifacts) {
    snapshot.artifacts[a.path] = a.modifiedAt;
    // Compute content hash for text-based files
    const ext = extname(a.path).toLowerCase();
    if ([".md", ".html", ".htm", ".txt", ".json", ".yaml", ".yml", ".toml", ".csv"].includes(ext)) {
      try {
        const fullPath = resolveArtifactPath(a.path);
        const content = readFileContent(fullPath);
        snapshot.hashes![a.path] = contentHash(content);
      } catch {
        // Skip if file can't be read
      }
    }
  }
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot));
}

export function loadPreviousSnapshot(): ManifestSnapshot | null {
  if (!existsSync(SNAPSHOT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8"));
  } catch {
    return null;
  }
}

// ── Line diff algorithm ────────────────────────────────────────────

export function computeLineDiff(oldText: string, newText: string, maxLines = 20): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff for small files
  const diff: DiffLine[] = [];
  const oldSet = new Map<string, number[]>();

  for (let i = 0; i < oldLines.length; i++) {
    const line = oldLines[i];
    if (!oldSet.has(line)) oldSet.set(line, []);
    oldSet.get(line)!.push(i);
  }

  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (diff.length >= maxLines * 2) break;

    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      // Context line (matching)
      diff.push({ type: "context", content: oldLines[oi] });
      oi++;
      ni++;
    } else {
      // Find next sync point — look ahead for a matching line
      let syncOld = -1;
      let syncNew = -1;
      const lookAhead = Math.min(10, Math.max(oldLines.length - oi, newLines.length - ni));

      for (let look = 1; look <= lookAhead; look++) {
        if (ni + look < newLines.length && oi < oldLines.length && newLines[ni + look] === oldLines[oi]) {
          syncNew = ni + look;
          break;
        }
        if (oi + look < oldLines.length && ni < newLines.length && oldLines[oi + look] === newLines[ni]) {
          syncOld = oi + look;
          break;
        }
      }

      if (syncNew >= 0) {
        // Lines were added in new
        while (ni < syncNew) {
          diff.push({ type: "added", content: newLines[ni] });
          ni++;
        }
      } else if (syncOld >= 0) {
        // Lines were removed from old
        while (oi < syncOld) {
          diff.push({ type: "removed", content: oldLines[oi] });
          oi++;
        }
      } else {
        // No sync point — treat as replace
        if (oi < oldLines.length) {
          diff.push({ type: "removed", content: oldLines[oi] });
          oi++;
        }
        if (ni < newLines.length) {
          diff.push({ type: "added", content: newLines[ni] });
          ni++;
        }
      }
    }
  }

  // Filter to only show changed lines with minimal context
  const result: DiffLine[] = [];
  for (let i = 0; i < diff.length; i++) {
    const line = diff[i];
    if (line.type !== "context") {
      // Include 1 line of context before and after
      if (i > 0 && result.length > 0 && result[result.length - 1].type === "context") {
        // Already have context
      } else if (i > 0 && diff[i - 1].type === "context") {
        result.push(diff[i - 1]);
      }
      result.push(line);
      if (i + 1 < diff.length && diff[i + 1].type === "context") {
        result.push(diff[i + 1]);
      }
    }
  }

  return result.slice(0, maxLines);
}

// ── Change feed computation ────────────────────────────────────────

export function computeChangeFeed(
  current: Manifest,
  previous: ManifestSnapshot | null,
  options?: { includeDiffs?: boolean },
): ChangeFeedEntry[] {
  if (!previous) return [];

  const changes: ChangeFeedEntry[] = [];
  const currentMap = new Map(current.artifacts.map((a) => [a.path, a]));
  const prevPaths = new Set(Object.keys(previous.artifacts));
  const prevHashes = previous.hashes || {};
  const includeDiffs = options?.includeDiffs ?? false;

  for (const artifact of current.artifacts) {
    if (!prevPaths.has(artifact.path)) {
      changes.push({
        path: artifact.path,
        title: artifact.title,
        type: "added",
        group: artifact.group,
        modifiedAt: artifact.modifiedAt,
      });
    } else if (previous.artifacts[artifact.path] !== artifact.modifiedAt) {
      const entry: ChangeFeedEntry = {
        path: artifact.path,
        title: artifact.title,
        type: "modified",
        group: artifact.group,
        modifiedAt: artifact.modifiedAt,
      };

      // Compute diff for text-based modified files
      if (includeDiffs) {
        const ext = extname(artifact.path).toLowerCase();
        if ([".md", ".html", ".htm", ".txt", ".yaml", ".yml", ".toml"].includes(ext)) {
          try {
            const fullPath = resolveArtifactPath(artifact.path);
            const currentContent = readFileContent(fullPath);
            const currentHash = contentHash(currentContent);

            // Only compute diff if content actually changed (not just touch)
            if (prevHashes[artifact.path] && prevHashes[artifact.path] !== currentHash) {
              // We don't have the old content, but we can read from the snapshot
              // For now, just show the diff is available — full old content would need git
              // Approximate: show lines that are new in the current version
              const oldHash = prevHashes[artifact.path];
              if (oldHash !== currentHash) {
                // Read old content from git if available, otherwise mark as changed
                try {
                  const { execSync } = require("child_process");
                  const gitOld = execSync(
                    `git show HEAD:"${artifact.path.split("/").slice(1).join("/")}"`,
                    { cwd: resolveArtifactPath(artifact.path.split("/")[0]), encoding: "utf8", timeout: 3000 },
                  );
                  entry.diff = computeLineDiff(gitOld, currentContent);
                } catch {
                  // Git not available or file not tracked — skip diff
                }
              }
            }
          } catch {
            // Skip diff on error
          }
        }
      }

      changes.push(entry);
    }
  }

  for (const prevPath of prevPaths) {
    if (!currentMap.has(prevPath)) {
      changes.push({
        path: prevPath,
        title: prevPath.split("/").pop() || prevPath,
        type: "deleted",
        group: "",
      });
    }
  }

  changes.sort((a, b) => {
    if (a.modifiedAt && b.modifiedAt) return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
    return 0;
  });

  return changes;
}
