/**
 * In-memory token bucket rate limiter.
 *
 * Configurable via HUB_RATE_LIMIT (requests per minute, default: 120)
 * and HUB_RATE_BURST (burst capacity, default: 30).
 *
 * Keyed by IP address. Buckets auto-expire after 10 minutes of inactivity.
 */

// ── Types ──────────────────────────────────────────────────────────

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// ── Configuration ──────────────────────────────────────────────────

export function getRateLimit(): number {
  return parseInt(process.env.HUB_RATE_LIMIT || "120", 10);
}

export function getBurstSize(): number {
  return parseInt(process.env.HUB_RATE_BURST || "30", 10);
}

export function isRateLimitEnabled(): boolean {
  // Disabled by default in development, enabled when explicitly set or in production
  return process.env.HUB_RATE_LIMIT !== undefined || process.env.NODE_ENV === "production";
}

// ── Bucket store ───────────────────────────────────────────────────

const buckets = new Map<string, TokenBucket>();
const CLEANUP_INTERVAL_MS = 60_000; // Clean expired buckets every minute
const BUCKET_EXPIRY_MS = 600_000; // Remove after 10 min inactivity

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > BUCKET_EXPIRY_MS) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't prevent process exit
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ── Token bucket logic ─────────────────────────────────────────────

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetMs: number } {
  const ratePerMinute = getRateLimit();
  const burst = getBurstSize();
  const tokensPerMs = ratePerMinute / 60_000;
  const now = Date.now();

  ensureCleanup();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: burst, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * tokensPerMs);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetMs: Math.ceil((1 - (bucket.tokens % 1)) / tokensPerMs),
    };
  }

  // Rate limited
  const waitMs = Math.ceil((1 - bucket.tokens) / tokensPerMs);
  return {
    allowed: false,
    remaining: 0,
    resetMs: waitMs,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

export function getBucketCount(): number {
  return buckets.size;
}

export function clearBuckets(): void {
  buckets.clear();
}
