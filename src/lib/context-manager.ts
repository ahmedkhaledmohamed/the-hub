/**
 * Multi-workspace context manager.
 *
 * Supports switching between different Hub configurations (contexts).
 * Each context can have its own workspaces, groups, tabs, and panels.
 * The active context is persisted via API and tracked server-side.
 */

import { loadConfig } from "./config";
import type { ContextConfig, HubConfig } from "./types";

// ── State ──────────────────────────────────────────────────────────

let activeContextName: string | null = null;

// ── Context operations ─────────────────────────────────────────────

export function getContexts(): ContextConfig[] {
  try {
    const config = loadConfig();
    return config.contexts || [];
  } catch {
    return [];
  }
}

export function getActiveContextName(): string | null {
  return activeContextName;
}

export function setActiveContext(name: string | null): void {
  activeContextName = name;
}

export function hasContexts(): boolean {
  return getContexts().length > 0;
}

export function getContextByName(name: string): ContextConfig | null {
  return getContexts().find((c) => c.name === name) || null;
}

/**
 * Get a summary of all available contexts.
 */
export function getContextSummary(): Array<{
  name: string;
  config: string;
  icon?: string;
  active: boolean;
}> {
  const contexts = getContexts();
  return contexts.map((c) => ({
    name: c.name,
    config: c.config,
    icon: c.icon,
    active: c.name === activeContextName,
  }));
}

/**
 * Reset context to default (main hub.config.ts).
 */
export function resetContext(): void {
  activeContextName = null;
}
