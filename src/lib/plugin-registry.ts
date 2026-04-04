/**
 * Plugin registry — discovers, loads, and manages Hub plugins.
 *
 * Plugins live in the `plugins/` directory at the project root.
 * Each plugin is a directory with an `index.ts` or `index.js`
 * that exports a `HubPlugin` object as default.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import type { HubPlugin, Artifact, PanelConfig, Manifest } from "./types";

// ── Registry state ─────────────────────────────────────────────────

const loadedPlugins: Map<string, HubPlugin> = new Map();
const cleanupFns: Map<string, () => void> = new Map();
let initialized = false;

const PLUGINS_DIR = resolve("plugins");

// ── Discovery ──────────────────────────────────────────────────────

export function discoverPlugins(): string[] {
  if (!existsSync(PLUGINS_DIR)) return [];

  return readdirSync(PLUGINS_DIR)
    .filter((name) => {
      const dir = join(PLUGINS_DIR, name);
      if (!statSync(dir).isDirectory()) return false;
      // Check for index.ts or index.js
      return existsSync(join(dir, "index.ts")) || existsSync(join(dir, "index.js"));
    });
}

// ── Loading ────────────────────────────────────────────────────────

export async function loadPlugin(name: string): Promise<HubPlugin | null> {
  const pluginDir = join(PLUGINS_DIR, name);
  const indexTs = join(pluginDir, "index.ts");
  const indexJs = join(pluginDir, "index.js");

  const entryPoint = existsSync(indexTs) ? indexTs : existsSync(indexJs) ? indexJs : null;
  if (!entryPoint) return null;

  try {
    // Dynamic import for both TS and JS
    const mod = await import(entryPoint);
    const plugin: HubPlugin = mod.default || mod;

    if (!plugin.name || !plugin.version) {
      console.warn(`[plugins] ${name}: missing name or version, skipping`);
      return null;
    }

    return plugin;
  } catch (err) {
    console.error(`[plugins] Failed to load ${name}:`, err);
    return null;
  }
}

export async function initializePlugins(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const pluginNames = discoverPlugins();
  if (pluginNames.length === 0) return;

  console.log(`[plugins] Discovered ${pluginNames.length} plugin(s): ${pluginNames.join(", ")}`);

  for (const name of pluginNames) {
    const plugin = await loadPlugin(name);
    if (!plugin) continue;

    loadedPlugins.set(plugin.name, plugin);

    // Run init hook
    if (plugin.onInit) {
      try {
        const cleanup = await plugin.onInit();
        if (typeof cleanup === "function") {
          cleanupFns.set(plugin.name, cleanup);
        }
      } catch (err) {
        console.error(`[plugins] ${plugin.name} init failed:`, err);
      }
    }

    console.log(`[plugins] Loaded: ${plugin.name} v${plugin.version}`);
  }
}

// ── Lifecycle hooks ────────────────────────────────────────────────

/**
 * Run onScan hooks — collect virtual artifacts from plugins.
 */
export async function runOnScan(manifest: Manifest): Promise<Artifact[]> {
  const virtualArtifacts: Artifact[] = [];

  for (const plugin of loadedPlugins.values()) {
    if (!plugin.onScan) continue;
    try {
      const artifacts = await plugin.onScan(manifest);
      virtualArtifacts.push(...artifacts);
    } catch (err) {
      console.error(`[plugins] ${plugin.name}.onScan failed:`, err);
    }
  }

  return virtualArtifacts;
}

/**
 * Run onSearch hooks — extend search results.
 */
export async function runOnSearch(query: string, results: Artifact[]): Promise<Artifact[]> {
  let extended = [...results];

  for (const plugin of loadedPlugins.values()) {
    if (!plugin.onSearch) continue;
    try {
      const additional = await plugin.onSearch(query, extended);
      extended.push(...additional);
    } catch (err) {
      console.error(`[plugins] ${plugin.name}.onSearch failed:`, err);
    }
  }

  return extended;
}

/**
 * Run onRender hooks — collect panel configs.
 */
export async function runOnRender(): Promise<PanelConfig[]> {
  const panels: PanelConfig[] = [];

  for (const plugin of loadedPlugins.values()) {
    if (!plugin.onRender) continue;
    try {
      const pluginPanels = await plugin.onRender();
      panels.push(...pluginPanels);
    } catch (err) {
      console.error(`[plugins] ${plugin.name}.onRender failed:`, err);
    }
  }

  return panels;
}

// ── Query ──────────────────────────────────────────────────────────

export function getLoadedPlugins(): HubPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function getPlugin(name: string): HubPlugin | undefined {
  return loadedPlugins.get(name);
}

export function getPluginCount(): number {
  return loadedPlugins.size;
}

export function isInitialized(): boolean {
  return initialized;
}

// ── Cleanup ────────────────────────────────────────────────────────

export async function destroyPlugins(): Promise<void> {
  for (const [name, cleanup] of cleanupFns) {
    try { cleanup(); } catch { /* ignore */ }
  }
  cleanupFns.clear();

  for (const plugin of loadedPlugins.values()) {
    if (plugin.onDestroy) {
      try { await plugin.onDestroy(); } catch { /* ignore */ }
    }
  }

  loadedPlugins.clear();
  initialized = false;
}

/**
 * Register a plugin programmatically (for testing).
 */
export function registerPlugin(plugin: HubPlugin): void {
  loadedPlugins.set(plugin.name, plugin);
}

/**
 * Unregister a plugin (for testing).
 */
export function unregisterPlugin(name: string): void {
  loadedPlugins.delete(name);
  cleanupFns.delete(name);
}
