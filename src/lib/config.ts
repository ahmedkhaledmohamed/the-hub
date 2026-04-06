import path from "path";
import type { HubConfig } from "./types";

let cachedConfig: HubConfig | null = null;

const DEFAULT_CONFIG: HubConfig = {
  name: "The Hub",
  port: 9001,
  workspaces: [],
  groups: [],
  tabs: [{ id: "all", label: "All", icon: "layout-grid", default: true }],
  panels: {},
  tools: [],
  scanner: {
    extensions: [".html", ".svg", ".md", ".csv"],
    skipDirs: ["node_modules", ".next", ".git", ".cursor", ".claude", "out", "dist", "build"],
    contentSnippetLength: 300,
  },
};

function resolveHomePath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(process.env.HOME || "/", p.slice(2));
  }
  return path.resolve(p);
}

export function loadConfig(): HubConfig {
  if (cachedConfig) return cachedConfig;

  // The config is imported at build time by Next.js.
  // For dynamic loading, we use a try/require pattern.
  let userConfig: Partial<HubConfig> = {};

  try {
    // Resolved via webpack alias @hub-config -> ./hub.config (set in next.config.ts)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("@hub-config");
    userConfig = loaded.default || loaded;
  } catch {
    console.warn("[hub] No hub.config found, using defaults. Copy hub.config.example.ts to hub.config.ts to configure.");
  }

  const config: HubConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    scanner: { ...DEFAULT_CONFIG.scanner, ...userConfig.scanner },
  };

  config.workspaces = config.workspaces.map((w) => ({
    ...w,
    path: resolveHomePath(w.path),
  }));

  if (!config.tabs.find((t) => t.id === "all")) {
    config.tabs.push({ id: "all", label: "All", icon: "layout-grid" });
  }

  if (!config.tabs.find((t) => t.default)) {
    config.tabs[0].default = true;
  }

  cachedConfig = config;
  return config;
}

export function getDefaultTab(config: HubConfig): string {
  const def = config.tabs.find((t) => t.default);
  return def?.id || config.tabs[0]?.id || "all";
}

export function getResolvedWorkspacePaths(config: HubConfig): string[] {
  return config.workspaces.map((w) => w.path);
}

export function invalidateConfigCache(): void {
  cachedConfig = null;

  // Clear the webpack/node require cache for the config module so
  // the next loadConfig() call reads the file fresh from disk.
  try {
    const resolvedPath = require.resolve("@hub-config");
    delete require.cache[resolvedPath];
  } catch {
    // @hub-config not in cache yet — nothing to clear
  }
}

// ── Client config (merged from config-client.ts in v5) ────────────

import type { TabConfig, PanelConfig, ToolConfig } from "./types";

export interface ClientConfig {
  name: string;
  tabs: TabConfig[];
  defaultTab: string;
  panels: Record<string, PanelConfig[]>;
  tools: ToolConfig[];
}

export async function getClientConfig(): Promise<ClientConfig> {
  const config = loadConfig();
  return {
    name: config.name,
    tabs: config.tabs,
    defaultTab: getDefaultTab(config),
    panels: config.panels || {},
    tools: config.tools || [],
  };
}
