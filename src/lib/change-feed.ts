import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Manifest, ManifestSnapshot, ChangeFeedEntry } from "./types";

const DATA_DIR = join(process.cwd(), ".hub-data");
const SNAPSHOT_FILE = join(DATA_DIR, "previous-manifest.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function saveSnapshot(manifest: Manifest): void {
  ensureDataDir();
  const snapshot: ManifestSnapshot = {
    generatedAt: manifest.generatedAt,
    artifacts: {},
  };
  for (const a of manifest.artifacts) {
    snapshot.artifacts[a.path] = a.modifiedAt;
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

export function computeChangeFeed(
  current: Manifest,
  previous: ManifestSnapshot | null,
): ChangeFeedEntry[] {
  if (!previous) return [];

  const changes: ChangeFeedEntry[] = [];
  const currentMap = new Map(current.artifacts.map((a) => [a.path, a]));
  const prevPaths = new Set(Object.keys(previous.artifacts));

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
      changes.push({
        path: artifact.path,
        title: artifact.title,
        type: "modified",
        group: artifact.group,
        modifiedAt: artifact.modifiedAt,
      });
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
