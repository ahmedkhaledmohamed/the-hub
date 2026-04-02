import type { Manifest } from "./types";
import { loadConfig, getResolvedWorkspacePaths } from "./config";
import { scan } from "./scanner";

let cachedManifest: Manifest | null = null;
let isScanning = false;
let watcherStarted = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 5000;

export function getManifest(): Manifest {
  if (!cachedManifest) {
    regenerate("startup");
  }
  if (!watcherStarted) {
    startWatcher();
  }
  return cachedManifest!;
}

export function regenerate(reason: string = "manual"): Manifest {
  if (isScanning) return cachedManifest!;
  isScanning = true;

  try {
    const config = loadConfig();
    cachedManifest = scan(config);
    cachedManifest.lastScanReason = reason;
    console.log(
      `[hub] Manifest regenerated (${reason}): ${cachedManifest.artifacts.length} artifacts`,
    );
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

export function getConfig() {
  return loadConfig();
}
