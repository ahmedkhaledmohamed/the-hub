/**
 * Shared AI client for The Hub.
 *
 * Supports OpenAI-compatible APIs (including Anthropic via proxy, Ollama, etc.)
 * with response caching in SQLite and optional streaming via SSE.
 *
 * Configuration via environment variables:
 *   AI_GATEWAY_URL  — Chat completions endpoint (e.g. https://api.openai.com/v1/chat/completions)
 *   AI_GATEWAY_KEY  — API key (sent as Bearer token)
 *   AI_MODEL        — Model name (default: claude-sonnet-4-5)
 */

import { getDb, contentHash } from "./db";

// ── Types ──────────────────────────────────────────────────────────

export interface AiConfig {
  gatewayUrl: string;
  apiKey: string;
  model: string;
}

function authHeaders(config: AiConfig): Record<string, string> {
  if (config.gatewayUrl.includes("hendrix") || process.env.AI_AUTH_HEADER === "x-api-key") {
    return { "x-api-key": config.apiKey };
  }
  return { Authorization: `Bearer ${config.apiKey}` };
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Cache key — if provided, responses are cached in SQLite */
  cacheKey?: string;
  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTtl?: number;
}

export interface AiCompletionResult {
  content: string;
  cached: boolean;
  model: string;
}

export interface AiStreamChunk {
  content: string;
  done: boolean;
}

// ── Configuration ──────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-5";
const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";
const OLLAMA_DEFAULT_MODEL = "llama3";

let ollamaDetected: boolean | null = null; // cached detection result

/**
 * Check if Ollama is running locally.
 * Result is cached for the process lifetime.
 */
export async function detectOllama(): Promise<boolean> {
  if (ollamaDetected !== null) return ollamaDetected;

  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    ollamaDetected = res.ok;
  } catch {
    ollamaDetected = false;
  }
  return ollamaDetected;
}

/**
 * Synchronous check — returns cached Ollama detection result.
 * Returns false if detection hasn't run yet.
 */
export function isOllamaDetected(): boolean {
  return ollamaDetected === true;
}

/**
 * Reset Ollama detection cache (useful for testing).
 */
export function resetOllamaDetection(): void {
  ollamaDetected = null;
}

export function getAiConfig(): AiConfig | null {
  // Explicit disable
  if (process.env.AI_PROVIDER === "none") return null;

  // Explicit env var config takes priority
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_KEY;

  if (gatewayUrl && apiKey) {
    return {
      gatewayUrl,
      apiKey,
      model: process.env.AI_MODEL || DEFAULT_MODEL,
    };
  }

  // Explicit Ollama provider config
  if (process.env.AI_PROVIDER === "ollama") {
    return {
      gatewayUrl: process.env.OLLAMA_URL || OLLAMA_URL,
      apiKey: "ollama", // Ollama doesn't require a key but the header is sent
      model: process.env.AI_MODEL || OLLAMA_DEFAULT_MODEL,
    };
  }

  // Check saved preferences (from Settings UI)
  try {
    const { readPreferences } = require("./config");
    const prefs = readPreferences();
    if (prefs.aiProvider === "ollama" || prefs.ollamaUrl) {
      const url = prefs.ollamaUrl || "http://localhost:11434";
      return {
        gatewayUrl: `${url}/v1/chat/completions`,
        apiKey: "ollama",
        model: prefs.aiDefaultModel || OLLAMA_DEFAULT_MODEL,
      };
    }
    if (prefs.openaiApiKey) {
      return {
        gatewayUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: prefs.openaiApiKey,
        model: prefs.aiDefaultModel || DEFAULT_MODEL,
      };
    }
    if (prefs.anthropicApiKey) {
      // Anthropic doesn't use OpenAI-compatible endpoint, but the multi-model
      // system handles it. For ai-client single-gateway mode, skip.
    }
  } catch {
    // config module not available (e.g., during build)
  }

  // Auto-detected Ollama (cached sync check)
  if (ollamaDetected === true) {
    return {
      gatewayUrl: OLLAMA_URL,
      apiKey: "ollama",
      model: process.env.AI_MODEL || OLLAMA_DEFAULT_MODEL,
    };
  }

  return null;
}

export function isAiConfigured(): boolean {
  return getAiConfig() !== null;
}

/**
 * Async version that runs Ollama detection if needed.
 */
export async function ensureAiConfigured(): Promise<boolean> {
  if (getAiConfig()) return true;
  // Try Ollama auto-detection
  await detectOllama();
  return getAiConfig() !== null;
}

// ── Cache ──────────────────────────────────────────────────────────

function ensureCacheTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_cache (
      cache_key   TEXT PRIMARY KEY,
      response    TEXT NOT NULL,
      model       TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL
    );
  `);
}

function getCachedResponse(cacheKey: string): AiCompletionResult | null {
  try {
    ensureCacheTable();
    const db = getDb();
    const row = db.prepare(
      "SELECT response, model FROM ai_cache WHERE cache_key = ? AND expires_at > datetime('now')"
    ).get(cacheKey) as { response: string; model: string } | undefined;

    if (row) {
      return { content: row.response, cached: true, model: row.model };
    }
  } catch {
    // Cache miss or DB error — proceed without cache
  }
  return null;
}

function setCachedResponse(cacheKey: string, response: string, model: string, ttlSeconds: number): void {
  try {
    ensureCacheTable();
    const db = getDb();
    db.prepare(`
      INSERT INTO ai_cache (cache_key, response, model, expires_at)
      VALUES (?, ?, ?, datetime('now', '+' || ? || ' seconds'))
      ON CONFLICT(cache_key) DO UPDATE SET
        response = excluded.response,
        model = excluded.model,
        created_at = datetime('now'),
        expires_at = excluded.expires_at
    `).run(cacheKey, response, model, ttlSeconds);
  } catch {
    // Cache write failure is non-fatal
  }
}

// ── Completion (non-streaming) ─────────────────────────────────────

export async function complete(options: AiCompletionOptions): Promise<AiCompletionResult> {
  // Check cache first
  if (options.cacheKey) {
    const cached = getCachedResponse(options.cacheKey);
    if (cached) return cached;
  }

  // Try to get config, with Ollama auto-detection fallback
  let config = getAiConfig();
  if (!config) {
    await detectOllama();
    config = getAiConfig();
  }

  if (!config) {
    return {
      content: `**AI unavailable** — no \`AI_GATEWAY_URL\` configured and no local Ollama detected.\n\nOptions:\n1. Set \`AI_GATEWAY_URL\` and \`AI_GATEWAY_KEY\` in \`.env.local\`\n2. Install and run [Ollama](https://ollama.com) locally (auto-detected)`,
      cached: false,
      model: "none",
    };
  }

  try {
    // Use circuit breaker with timeout for AI calls
    let cbModule: typeof import("./circuit-breaker") | null = null;
    try { cbModule = require("./circuit-breaker"); } catch { /* circuit breaker not critical */ }

    const cb = cbModule?.getCircuitBreaker("ai-completion", { timeoutMs: parseInt(process.env.HUB_AI_TIMEOUT_MS || "15000", 10) });

    const doFetch = async (signal?: AbortSignal) => {
      return fetch(config!.gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(config!),
        },
        body: JSON.stringify({
          model: config!.model,
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature ?? 0.3,
          messages: options.messages,
        }),
        signal,
      });
    };

    const res = cb
      ? await cb.execute((signal) => doFetch(signal))
      : await doFetch();

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[ai-client] Gateway returned ${res.status}: ${errText}`);
      return {
        content: `**AI error** — Gateway returned ${res.status}. Check your \`AI_GATEWAY_URL\` and \`AI_GATEWAY_KEY\`.`,
        cached: false,
        model: config.model,
      };
    }

    const data = await res.json();
    const content =
      data.choices?.[0]?.message?.content ||
      data.content?.[0]?.text ||
      "No response from AI.";

    const result: AiCompletionResult = {
      content,
      cached: false,
      model: config.model,
    };

    // Cache the result
    if (options.cacheKey) {
      setCachedResponse(options.cacheKey, content, config.model, options.cacheTtl || 3600);
    }

    // Structured logging
    try {
      const { hubLog } = require("./logger");
      hubLog("info", "ai", "AI completion", {
        model: config.model,
        cached: false,
        contentLength: content.length,
        messageCount: options.messages.length,
      });
    } catch { /* logger not critical */ }

    return result;
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    const errName = (err as Error).name || "";
    console.error("[ai-client] Request error:", errMsg);
    try {
      const { hubLog } = require("./logger");
      hubLog("error", "ai", "AI request failed", { model: config.model, error: errMsg });
    } catch { /* logger not critical */ }
    try {
      const { reportError } = require("./error-reporter");
      reportError("ai", err, { model: config.model });
    } catch { /* non-critical */ }

    // Circuit breaker specific messages
    if (errName === "CircuitOpenError") {
      return { content: `**AI temporarily unavailable** — too many consecutive failures. ${errMsg}`, cached: false, model: config.model };
    }
    if (errName === "TimeoutError") {
      return { content: `**AI timeout** — request took too long. ${errMsg}`, cached: false, model: config.model };
    }
    return { content: "**AI error** — Could not connect to the AI gateway. Check that the server is running.", cached: false, model: config.model };
  }
}

// ── Streaming ──────────────────────────────────────────────────────

export async function* stream(options: AiCompletionOptions): AsyncGenerator<AiStreamChunk> {
  let config = getAiConfig();
  if (!config) {
    await detectOllama();
    config = getAiConfig();
  }

  if (!config) {
    yield { content: "AI unavailable — no AI gateway configured and no local Ollama detected.", done: true };
    return;
  }

  try {
    const res = await fetch(config.gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(config),
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.3,
        messages: options.messages,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      yield { content: `AI error — Gateway returned ${res.status}.`, done: true };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          yield { content: "", done: true };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta =
            parsed.choices?.[0]?.delta?.content ||
            parsed.delta?.text ||
            "";
          if (delta) {
            yield { content: delta, done: false };
          }
        } catch {
          // Skip malformed SSE chunks
        }
      }
    }

    yield { content: "", done: true };
  } catch (err) {
    console.error("[ai-client] Stream error:", err);
    yield { content: "AI error — stream failed.", done: true };
  }
}

// ── Convenience helpers ────────────────────────────────────────────

/**
 * Simple single-prompt completion with optional caching.
 */
export async function ask(
  prompt: string,
  options?: { systemPrompt?: string; cacheKey?: string; cacheTtl?: number; maxTokens?: number },
): Promise<AiCompletionResult> {
  const messages: AiMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  return complete({
    messages,
    cacheKey: options?.cacheKey,
    cacheTtl: options?.cacheTtl,
    maxTokens: options?.maxTokens,
  });
}

/**
 * Generate a cache key from a prompt string.
 */
export function promptCacheKey(prompt: string): string {
  return `ai:${contentHash(prompt)}`;
}
