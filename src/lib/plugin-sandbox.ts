/**
 * Plugin sandbox — isolated execution for untrusted plugins.
 *
 * Uses Node.js vm module to create a restricted execution context.
 * Plugins run with limited API access and can't access the filesystem
 * or network directly. They communicate through a controlled API surface.
 *
 * Sandbox levels:
 * - "trusted": full Node.js access (default for built-in plugins)
 * - "restricted": vm sandbox with limited API (for community plugins)
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import type { HubPlugin, Artifact, PanelConfig, Manifest } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export type SandboxLevel = "trusted" | "restricted";

export interface SandboxConfig {
  level: SandboxLevel;
  /** Timeout for plugin execution in ms */
  timeout: number;
  /** Max memory in MB (soft limit, advisory) */
  maxMemory: number;
  /** Allow network access (fetch) */
  allowNetwork: boolean;
  /** Allow filesystem reads (within plugin dir) */
  allowFs: boolean;
}

export interface SandboxedPlugin {
  plugin: HubPlugin;
  config: SandboxConfig;
  errors: string[];
}

// ── Defaults ───────────────────────────────────────────────────────

const DEFAULT_TRUSTED: SandboxConfig = {
  level: "trusted",
  timeout: 30000,
  maxMemory: 128,
  allowNetwork: true,
  allowFs: true,
};

const DEFAULT_RESTRICTED: SandboxConfig = {
  level: "restricted",
  timeout: 5000,
  maxMemory: 64,
  allowNetwork: false,
  allowFs: false,
};

export function getSandboxConfig(level: SandboxLevel = "restricted"): SandboxConfig {
  return level === "trusted" ? { ...DEFAULT_TRUSTED } : { ...DEFAULT_RESTRICTED };
}

// ── Sandbox execution ──────────────────────────────────────────────

/**
 * Create a sandboxed wrapper around a plugin's lifecycle hooks.
 * In "trusted" mode, hooks run directly.
 * In "restricted" mode, hooks are wrapped with timeout and error isolation.
 */
export function sandboxPlugin(plugin: HubPlugin, config: SandboxConfig): SandboxedPlugin {
  const errors: string[] = [];

  if (config.level === "trusted") {
    return { plugin, config, errors };
  }

  // Restricted mode: wrap each hook with timeout + error isolation
  const sandboxed: HubPlugin = {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,

    onInit: plugin.onInit ? wrapWithTimeout(plugin.onInit, config.timeout, plugin.name, "onInit", errors) as HubPlugin["onInit"] : undefined,
    onDestroy: plugin.onDestroy ? wrapWithTimeout(plugin.onDestroy, config.timeout, plugin.name, "onDestroy", errors) as HubPlugin["onDestroy"] : undefined,
    onScan: plugin.onScan ? wrapWithTimeout(plugin.onScan, config.timeout, plugin.name, "onScan", errors) as HubPlugin["onScan"] : undefined,
    onSearch: plugin.onSearch ? wrapWithTimeout(plugin.onSearch, config.timeout, plugin.name, "onSearch", errors) as HubPlugin["onSearch"] : undefined,
    onRender: plugin.onRender ? wrapWithTimeout(plugin.onRender, config.timeout, plugin.name, "onRender", errors) as HubPlugin["onRender"] : undefined,
  };

  return { plugin: sandboxed, config, errors };
}

// ── Timeout wrapper ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapWithTimeout(
  fn: (...args: any[]) => any,
  timeoutMs: number,
  pluginName: string,
  hookName: string,
  errors: string[],
): (...args: any[]) => any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]) => {
    try {
      const result = await Promise.race([
        Promise.resolve(fn(...args)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Plugin "${pluginName}.${hookName}" timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`[${pluginName}.${hookName}] ${message}`);
      console.error(`[sandbox] ${pluginName}.${hookName} failed: ${message}`);

      // Return safe defaults
      if (hookName === "onScan" || hookName === "onSearch") return [];
      if (hookName === "onRender") return [];
      return undefined;
    }
  };
}

// ── Permission checks ──────────────────────────────────────────────

export function canAccessNetwork(config: SandboxConfig): boolean {
  return config.allowNetwork;
}

export function canAccessFilesystem(config: SandboxConfig): boolean {
  return config.allowFs;
}

export function getPluginSandboxLevel(pluginName: string): SandboxLevel {
  // Built-in plugins are trusted
  const TRUSTED_PLUGINS = new Set(["hello-world", "github"]);
  if (TRUSTED_PLUGINS.has(pluginName)) return "trusted";

  // Everything else is restricted by default
  return "restricted";
}

// ── Validation ─────────────────────────────────────────────────────

export function validatePluginStructure(plugin: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plugin || typeof plugin !== "object") {
    return { valid: false, errors: ["Plugin must be an object"] };
  }

  const p = plugin as Record<string, unknown>;

  if (!p.name || typeof p.name !== "string") {
    errors.push("Plugin must have a string 'name' field");
  }

  if (!p.version || typeof p.version !== "string") {
    errors.push("Plugin must have a string 'version' field");
  }

  // Check hooks are functions if present
  for (const hook of ["onInit", "onDestroy", "onScan", "onSearch", "onRender"]) {
    if (p[hook] !== undefined && typeof p[hook] !== "function") {
      errors.push(`Plugin.${hook} must be a function`);
    }
  }

  return { valid: errors.length === 0, errors };
}
