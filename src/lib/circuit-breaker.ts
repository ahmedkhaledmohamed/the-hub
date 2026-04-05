/**
 * Circuit breaker for external API calls.
 *
 * Prevents cascading failures by tracking consecutive failures and
 * temporarily "opening" the circuit after a threshold is reached.
 *
 * States:
 * - CLOSED: Normal operation. Requests pass through.
 * - OPEN: Too many failures. Requests fail immediately without calling the API.
 * - HALF_OPEN: After cooldown, one test request is allowed through.
 *
 * Configuration via environment:
 *   HUB_AI_TIMEOUT_MS      — AI call timeout in milliseconds (default: 15000)
 *   HUB_CB_FAILURE_THRESHOLD — Consecutive failures to open circuit (default: 3)
 *   HUB_CB_COOLDOWN_MS     — Time before retrying after circuit opens (default: 30000)
 */

// ── Types ──────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  timeoutMs: number;
  name: string;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  openedAt: number | null;
}

// ── Circuit Breaker ───────────────────────────────────────────────

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private openedAt: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = {
      failureThreshold: config.failureThreshold || parseInt(process.env.HUB_CB_FAILURE_THRESHOLD || "3", 10),
      cooldownMs: config.cooldownMs || parseInt(process.env.HUB_CB_COOLDOWN_MS || "30000", 10),
      timeoutMs: config.timeoutMs || parseInt(process.env.HUB_AI_TIMEOUT_MS || "15000", 10),
      name: config.name,
    };
  }

  /**
   * Execute a function through the circuit breaker.
   * Adds timeout and tracks success/failure.
   */
  async execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === "open") {
      const elapsed = Date.now() - (this.openedAt || 0);
      if (elapsed < this.config.cooldownMs) {
        throw new CircuitOpenError(this.config.name, this.config.cooldownMs - elapsed);
      }
      // Cooldown elapsed — move to half_open, allow one test request
      this.state = "half_open";
    }

    // Execute with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timeout);
      this.onSuccess();
      return result;
    } catch (err) {
      clearTimeout(timeout);
      this.onFailure();

      // Distinguish timeout from other errors
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError(this.config.name, this.config.timeoutMs);
      }
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.totalSuccesses++;
    this.lastSuccess = Date.now();
    if (this.state === "half_open") {
      this.state = "closed";
      this.openedAt = null;
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.totalFailures++;
    this.lastFailure = Date.now();

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  /**
   * Get current circuit breaker status.
   */
  getStatus(): CircuitBreakerStatus {
    return {
      name: this.config.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      openedAt: this.openedAt,
    };
  }

  /**
   * Manually reset the circuit breaker.
   */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  /**
   * Get the configured timeout in milliseconds.
   */
  getTimeoutMs(): number {
    return this.config.timeoutMs;
  }
}

// ── Error types ───────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  public readonly retryAfterMs: number;
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker "${name}" is open. Retry after ${Math.round(retryAfterMs / 1000)}s.`);
    this.name = "CircuitOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends Error {
  public readonly timeoutMs: number;
  constructor(name: string, timeoutMs: number) {
    super(`Request to "${name}" timed out after ${timeoutMs}ms.`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

// ── Singleton instances ───────────────────────────────────────────

const breakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker.
 */
export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker({ name, ...config }));
  }
  return breakers.get(name)!;
}

/**
 * Get status of all circuit breakers.
 */
export function getAllCircuitBreakerStatus(): CircuitBreakerStatus[] {
  return Array.from(breakers.values()).map((cb) => cb.getStatus());
}

/**
 * Reset all circuit breakers.
 */
export function resetAllCircuitBreakers(): void {
  for (const cb of breakers.values()) cb.reset();
}
