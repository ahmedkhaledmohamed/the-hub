import type { Manifest } from "./types";
import type { HubConfig } from "./types";
import { loadConfig } from "./config";
import { scan } from "./scanner";

let cachedManifest: Manifest | null = null;
let isScanning = false;

export function getManifest(): Manifest {
  if (!cachedManifest) {
    regenerate();
  }
  return cachedManifest!;
}

export function regenerate(): Manifest {
  if (isScanning) return cachedManifest!;
  isScanning = true;

  try {
    const config = loadConfig();
    cachedManifest = scan(config);
    return cachedManifest;
  } finally {
    isScanning = false;
  }
}

export function getConfig(): HubConfig {
  return loadConfig();
}
