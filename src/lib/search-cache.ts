/**
 * Search result caching — LRU cache with TTL for fast repeated queries.
 *
 * Caches FTS5 search results in memory to achieve < 50ms p95 latency
 * for repeated queries. Cache invalidates on manifest regeneration.
 *
 * Features:
 * - LRU eviction (max 200 entries by default)
 * - TTL-based expiry (30 seconds by default)
 * - Auto-invalidate on scan events
 * - Hit/miss tracking for monitoring
 */

// ── Types ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  ttlMs: number;
  evictions: number;
}

// ── LRU Cache ─────────────────────────────────────────────────────

export class SearchCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;
  private totalHits = 0;
  private totalMisses = 0;
  private totalEvictions = 0;

  constructor(options?: { maxSize?: number; ttlMs?: number }) {
    this.maxSize = options?.maxSize || 200;
    this.ttlMs = options?.ttlMs || 30000; // 30 seconds
  }

  /**
   * Get a cached value. Returns undefined on miss or expiry.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.totalMisses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.totalMisses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);
    this.totalHits++;
    return entry.value;
  }

  /**
   * Set a cached value.
   */
  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
        this.totalEvictions++;
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Invalidate all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.totalHits + this.totalMisses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: total > 0 ? Math.round((this.totalHits / total) * 100) / 100 : 0,
      ttlMs: this.ttlMs,
      evictions: this.totalEvictions,
    };
  }

  /**
   * Reset statistics (for testing).
   */
  resetStats(): void {
    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalEvictions = 0;
  }
}

// ── Singleton search cache ────────────────────────────────────────

const searchResultCache = new SearchCache<unknown>({
  maxSize: parseInt(process.env.HUB_SEARCH_CACHE_SIZE || "200", 10),
  ttlMs: parseInt(process.env.HUB_SEARCH_CACHE_TTL || "30000", 10),
});

/**
 * Build a cache key from search parameters.
 */
export function buildSearchCacheKey(query: string, limit: number, offset: number, mode: string): string {
  return `${mode}:${query}:${limit}:${offset}`;
}

/**
 * Get the global search cache.
 */
export function getSearchCache(): SearchCache<unknown> {
  return searchResultCache;
}

/**
 * Invalidate search cache (call on manifest regeneration).
 */
export function invalidateSearchCache(): void {
  searchResultCache.clear();
}
