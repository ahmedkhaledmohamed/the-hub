import type { Manifest, HubConfig } from "./types";
import { loadConfig, getResolvedWorkspacePaths, invalidateConfigCache } from "./config";
import { scan } from "./scanner";
import { persistArtifacts, getChangedFiles, updateMtimes } from "./db";
import { recordSnapshot } from "./trends";
import { readPreferences } from "./config";
import path from "path";

let cachedManifest: Manifest | null = null;
let isScanning = false;
let watcherStarted = false;
let configWatcherStarted = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 5000;

export function getManifest(): Manifest {
  if (!cachedManifest) {
    regenerate("startup");
  }
  if (!watcherStarted) {
    startWatcher();
  }
  if (!configWatcherStarted) {
    startConfigWatcher();
  }
  return cachedManifest!;
}

function getEffectiveConfig(): HubConfig {
  const config = loadConfig();
  const prefs = readPreferences();
  if (prefs.scannerExclude?.length) {
    return {
      ...config,
      scanner: {
        ...config.scanner,
        skipDirs: [...(config.scanner?.skipDirs || []), ...prefs.scannerExclude],
      },
    };
  }
  return config;
}

export function regenerate(reason: string = "manual"): Manifest {
  if (isScanning) return cachedManifest!;
  isScanning = true;

  try {
    const config = getEffectiveConfig();
    const result = scan(config, { withContent: true });
    cachedManifest = result.manifest;
    cachedManifest.lastScanReason = reason;

    // Persist to SQLite + update mtime cache
    try {
      // Check what actually changed (incremental)
      const changes = getChangedFiles(result.fileMtimes);
      const changedCount = changes.changed.length + changes.added.length + changes.removed.length;

      persistArtifacts(cachedManifest.artifacts, result.contentMap);
      updateMtimes(result.fileMtimes);
      recordSnapshot(cachedManifest);

      // Structured logging for scan operations
      try {
        const { hubLog } = require("./logger");
        hubLog("info", "scan", "Workspace scan complete", {
          reason,
          artifactCount: cachedManifest.artifacts.length,
          added: changes.added.length,
          removed: changes.removed.length,
          changed: changes.changed.length,
          unchanged: changes.unchanged.length,
          durationMs: 0, // filled by caller if timed
        });
      } catch { /* logger not critical */ }

      // Emit events for SSE subscribers
      try {
        const { emit } = require("./events");
        emit("scan.complete", {
          reason,
          artifactCount: cachedManifest.artifacts.length,
          added: changes.added.length,
          removed: changes.removed.length,
          changed: changes.changed.length,
        });
        // Emit individual artifact events for significant changes
        for (const path of changes.added.slice(0, 10)) {
          emit("artifact.created", { path });
        }
        for (const path of changes.removed.slice(0, 10)) {
          emit("artifact.deleted", { path });
        }
      } catch { /* events not critical */ }

      // Invalidate caches on scan
      try { const { invalidateSearchCache, invalidateMcpCache } = require("./search-cache"); invalidateSearchCache(); invalidateMcpCache(); } catch { /* non-critical */ }
      // Auto-start digest scheduler if enabled
      try { const { autoStartDigest } = require("./digest-scheduler"); autoStartDigest(); } catch { /* non-critical */ }
      // Auto-run hygiene analysis to populate sidebar badge
      try {
        const { analyzeHygiene, invalidateHygieneCache } = require("./hygiene-analyzer");
        invalidateHygieneCache();
        analyzeHygiene(cachedManifest.artifacts, cachedManifest.generatedAt);
      } catch { /* non-critical — hygiene is advisory */ }

      // Auto-generate context files (.hub-context.md, .cursorrules) in workspaces
      try {
        const { writeContextFilesToAllWorkspaces } = require("./context-file-generator");
        writeContextFilesToAllWorkspaces(cachedManifest);
      } catch { /* non-critical */ }

      // Trigger embedding auto-generation after scan (non-blocking)
      try {
        const { autoGenerateIfNeeded } = require("./embedding-generator");
        autoGenerateIfNeeded().catch(() => { /* non-blocking */ });
        // Prune stale embeddings for removed artifacts
        const { pruneStaleEmbeddings } = require("./embeddings");
        pruneStaleEmbeddings();
      } catch { /* non-critical */ }

      if (changedCount > 0) {
        console.log(
          `[scan] ${cachedManifest.artifacts.length} artifacts (${reason}) +${changes.added.length} -${changes.removed.length} ~${changes.changed.length}`,
        );
      } else {
        console.log(
          `[scan] ${cachedManifest.artifacts.length} artifacts (${reason}) — no changes`,
        );
      }
    } catch (dbErr) {
      console.warn("[scan] SQLite persistence failed (non-fatal):", dbErr);
      console.log(
        `[scan] ${cachedManifest.artifacts.length} artifacts (${reason})`,
      );
    }

    return cachedManifest;
  } finally {
    isScanning = false;
  }
}

function startWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;

  const config = loadConfig();
  const paths = getResolvedWorkspacePaths(config);
  const extensions = config.scanner?.extensions ?? [".html", ".svg", ".md", ".csv"];
  const skipDirs = new Set(
    config.scanner?.skipDirs ?? [
      "node_modules", ".next", ".git", ".cursor", ".claude",
      "out", "dist", "build", "agent-transcripts",
    ],
  );

  import("chokidar")
    .then(({ watch }) => {
      const globs = extensions.map((ext) => `**/*${ext}`);

      const watcher = watch(globs, {
        cwd: undefined,
        ignored: (p: string) => {
          const segments = p.split("/");
          return segments.some((s) => skipDirs.has(s));
        },
        persistent: true,
        ignoreInitial: true,
        followSymlinks: true,
        depth: 15,
      });

      for (const wsPath of paths) {
        watcher.add(wsPath);
      }

      const debouncedRegenerate = (changedPath: string) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const filename = changedPath.split("/").pop() || changedPath;
          regenerate(`file changed: ${filename}`);
        }, DEBOUNCE_MS);
      };

      watcher
        .on("add", debouncedRegenerate)
        .on("change", debouncedRegenerate)
        .on("unlink", debouncedRegenerate);

      console.log(`[hub] File watcher started on ${paths.length} workspace(s)`);
    })
    .catch((err) => {
      console.warn("[hub] Could not start file watcher:", err);
      watcherStarted = false;
    });
}

function startConfigWatcher() {
  if (configWatcherStarted) return;
  configWatcherStarted = true;

  const configPath = path.resolve("./hub.config.ts");

  import("chokidar")
    .then(({ watch }) => {
      const watcher = watch(configPath, {
        persistent: true,
        ignoreInitial: true,
      });

      watcher.on("change", () => {
        console.log("[hub] hub.config.ts changed — reloading config");
        invalidateConfigCache();
        regenerate("config changed");
      });

      console.log(`[hub] Config watcher started on ${configPath}`);
    })
    .catch((err) => {
      console.warn("[hub] Could not start config watcher:", err);
      configWatcherStarted = false;
    });
}

export function getConfig() {
  return loadConfig();
}
