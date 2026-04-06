/**
 * MCP tool caching + profiling — fast responses for core tools.
 *
 * Caches MCP tool results in memory with short TTL (15s) to handle
 * repeated queries within the same agent session. Logs timing for
 * each tool invocation.
 *
 * Target: < 100ms p95 for core tools (search, read, list, manifest).
 */

import { SearchCache } from "./search-cache";

// ── Cache ─────────────────────────────────────────────────────────

const mcpCache = new SearchCache<string>({
  maxSize: 100,
  ttlMs: parseInt(process.env.HUB_MCP_CACHE_TTL || "15000", 10), // 15 seconds
});

/**
 * Get or compute a cached MCP tool result.
 */
export async function cachedToolCall<T>(
  toolName: string,
  cacheKey: string,
  fn: () => T | Promise<T>,
): Promise<{ result: T; cached: boolean; durationMs: number }> {
  // Check cache
  const cached = mcpCache.get(cacheKey);
  if (cached !== undefined) {
    return { result: JSON.parse(cached) as T, cached: true, durationMs: 0 };
  }

  // Execute and time
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;

  // Cache the result
  mcpCache.set(cacheKey, JSON.stringify(result));

  // Log timing
  try {
    const { hubLog } = require("./logger");
    hubLog("info", "ai", `MCP tool: ${toolName}`, { durationMs, cached: false, cacheKey: cacheKey.slice(0, 50) });
  } catch { /* non-critical */ }

  return { result, cached: false, durationMs };
}

/**
 * Invalidate the MCP cache (on scan).
 */
export function invalidateMcpCache(): void {
  mcpCache.clear();
}

/**
 * Get MCP cache stats.
 */
export function getMcpCacheStats() {
  return mcpCache.getStats();
}
