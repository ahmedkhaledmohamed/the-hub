/**
 * Plugin marketplace — discover, install, and manage Hub plugins.
 *
 * Plugins can be installed from:
 * - npm packages (hub-plugin-*)
 * - Git repositories
 * - Local directories
 *
 * The built-in registry lists known plugins with metadata.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

// ── Types ──────────────────────────────────────────────────────────

export interface MarketplacePlugin {
  /** Unique plugin identifier */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description */
  description: string;
  /** Plugin version */
  version: string;
  /** Author name */
  author: string;
  /** Install source: npm package, git URL, or "builtin" */
  source: string;
  /** Plugin category */
  category: "integration" | "panel" | "tool" | "ai" | "other";
  /** Whether it's installed locally */
  installed: boolean;
  /** Tags for search */
  tags: string[];
}

// ── Built-in registry ──────────────────────────────────────────────

const BUILTIN_PLUGINS: Omit<MarketplacePlugin, "installed">[] = [
  {
    name: "hello-world",
    displayName: "Hello World",
    description: "Example plugin demonstrating all lifecycle hooks",
    version: "1.0.0",
    author: "The Hub",
    source: "builtin",
    category: "other",
    tags: ["example", "starter"],
  },
  {
    name: "github",
    displayName: "GitHub Integration",
    description: "PR counts, issue tracking, and activity panels from GitHub repos",
    version: "1.0.0",
    author: "The Hub",
    source: "builtin",
    category: "integration",
    tags: ["github", "issues", "pull-requests", "repos"],
  },
];

const PLUGINS_DIR = resolve("plugins");

// ── Discovery ──────────────────────────────────────────────────────

export function getInstalledPlugins(): string[] {
  if (!existsSync(PLUGINS_DIR)) return [];
  const { readdirSync, statSync } = require("fs");
  return (readdirSync(PLUGINS_DIR) as string[]).filter((name) => {
    const dir = join(PLUGINS_DIR, name);
    return statSync(dir).isDirectory() && (
      existsSync(join(dir, "index.ts")) || existsSync(join(dir, "index.js"))
    );
  });
}

export function isPluginInstalled(name: string): boolean {
  return getInstalledPlugins().includes(name);
}

// ── Registry ───────────────────────────────────────────────────────

export function getMarketplacePlugins(): MarketplacePlugin[] {
  const installed = new Set(getInstalledPlugins());

  return BUILTIN_PLUGINS.map((p) => ({
    ...p,
    installed: installed.has(p.name),
  }));
}

export function searchMarketplace(query: string): MarketplacePlugin[] {
  const q = query.toLowerCase();
  return getMarketplacePlugins().filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.displayName.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.tags.some((t) => t.toLowerCase().includes(q))
  );
}

// ── Installation ───────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  name: string;
  message: string;
  path?: string;
}

export function installPlugin(nameOrUrl: string): InstallResult {
  if (!existsSync(PLUGINS_DIR)) mkdirSync(PLUGINS_DIR, { recursive: true });

  // Check if it's a git URL
  if (nameOrUrl.startsWith("http") || nameOrUrl.startsWith("git@")) {
    return installFromGit(nameOrUrl);
  }

  // Check if it's a known builtin
  const builtin = BUILTIN_PLUGINS.find((p) => p.name === nameOrUrl);
  if (builtin && builtin.source === "builtin") {
    return {
      success: isPluginInstalled(nameOrUrl),
      name: nameOrUrl,
      message: isPluginInstalled(nameOrUrl)
        ? `Plugin "${nameOrUrl}" is already installed (builtin).`
        : `Plugin "${nameOrUrl}" is a builtin but not found in plugins/. Copy it from the repo.`,
    };
  }

  // Try npm package
  return installFromNpm(nameOrUrl);
}

function installFromGit(url: string): InstallResult {
  // Derive name from URL
  const name = url.split("/").pop()?.replace(/\.git$/, "") || "unknown";
  const targetDir = join(PLUGINS_DIR, name);

  if (existsSync(targetDir)) {
    return { success: false, name, message: `Plugin "${name}" already exists at ${targetDir}` };
  }

  try {
    execSync(`git clone --depth 1 "${url}" "${targetDir}"`, { stdio: "pipe", timeout: 30000 });
    return { success: true, name, message: `Installed "${name}" from git`, path: targetDir };
  } catch (err) {
    return { success: false, name, message: `Failed to clone: ${err}` };
  }
}

function installFromNpm(name: string): InstallResult {
  const packageName = name.startsWith("hub-plugin-") ? name : `hub-plugin-${name}`;
  const targetDir = join(PLUGINS_DIR, name);

  if (existsSync(targetDir)) {
    return { success: false, name, message: `Plugin "${name}" already exists` };
  }

  try {
    mkdirSync(targetDir, { recursive: true });
    execSync(`npm pack ${packageName} --pack-destination "${targetDir}"`, { stdio: "pipe", timeout: 30000 });
    // Unpack
    execSync(`cd "${targetDir}" && tar xzf *.tgz --strip-components=1 && rm *.tgz`, { stdio: "pipe" });
    return { success: true, name, message: `Installed "${name}" from npm (${packageName})`, path: targetDir };
  } catch {
    // Clean up on failure
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
    return { success: false, name, message: `Package "${packageName}" not found on npm` };
  }
}

// ── Uninstallation ─────────────────────────────────────────────────

export function uninstallPlugin(name: string): InstallResult {
  const targetDir = join(PLUGINS_DIR, name);

  if (!existsSync(targetDir)) {
    return { success: false, name, message: `Plugin "${name}" is not installed` };
  }

  // Don't uninstall builtins
  const builtin = BUILTIN_PLUGINS.find((p) => p.name === name);
  if (builtin?.source === "builtin") {
    return { success: false, name, message: `Cannot uninstall builtin plugin "${name}"` };
  }

  try {
    rmSync(targetDir, { recursive: true });
    return { success: true, name, message: `Uninstalled "${name}"` };
  } catch (err) {
    return { success: false, name, message: `Failed to uninstall: ${err}` };
  }
}
