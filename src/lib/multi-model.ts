/**
 * Multi-model AI support — route requests to Claude, GPT, or Llama.
 *
 * Provides a unified interface over multiple AI providers with:
 * - Provider registry with per-provider configuration
 * - Anthropic native API support (Messages API format)
 * - OpenAI API support (Chat Completions format)
 * - Ollama local model support (OpenAI-compatible)
 * - Model selection per request or global default
 * - Provider health checks and model discovery
 *
 * Configuration:
 *   ANTHROPIC_API_KEY  — Anthropic API key for Claude models
 *   OPENAI_API_KEY     — OpenAI API key for GPT models
 *   OLLAMA_URL         — Ollama server URL (default: http://localhost:11434)
 *   AI_DEFAULT_PROVIDER — Default provider: "anthropic" | "openai" | "ollama"
 */

// ── Types ──────────────────────────────────────────────────────────

export type ProviderName = "anthropic" | "openai" | "ollama";

export interface ProviderConfig {
  name: ProviderName;
  apiUrl: string;
  apiKey: string;
  defaultModel: string;
  enabled: boolean;
}

export interface ModelInfo {
  id: string;
  provider: ProviderName;
  displayName: string;
  contextWindow: number;
  supportsStreaming: boolean;
}

export interface MultiModelRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  provider?: ProviderName;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface MultiModelResponse {
  content: string;
  model: string;
  provider: ProviderName;
  cached: boolean;
  tokensUsed?: number;
}

// ── Known models ──────────────────────────────────────────────────

export const KNOWN_MODELS: ModelInfo[] = [
  // Anthropic Claude
  { id: "claude-opus-4-5", provider: "anthropic", displayName: "Claude Opus 4.5", contextWindow: 200000, supportsStreaming: true },
  { id: "claude-sonnet-4-5", provider: "anthropic", displayName: "Claude Sonnet 4.5", contextWindow: 200000, supportsStreaming: true },
  { id: "claude-haiku-3-5", provider: "anthropic", displayName: "Claude Haiku 3.5", contextWindow: 200000, supportsStreaming: true },
  // OpenAI GPT
  { id: "gpt-4o", provider: "openai", displayName: "GPT-4o", contextWindow: 128000, supportsStreaming: true },
  { id: "gpt-4o-mini", provider: "openai", displayName: "GPT-4o Mini", contextWindow: 128000, supportsStreaming: true },
  { id: "gpt-4-turbo", provider: "openai", displayName: "GPT-4 Turbo", contextWindow: 128000, supportsStreaming: true },
  // Ollama (local)
  { id: "llama3", provider: "ollama", displayName: "Llama 3", contextWindow: 8192, supportsStreaming: true },
  { id: "llama3:70b", provider: "ollama", displayName: "Llama 3 70B", contextWindow: 8192, supportsStreaming: true },
  { id: "mistral", provider: "ollama", displayName: "Mistral", contextWindow: 32768, supportsStreaming: true },
  { id: "codellama", provider: "ollama", displayName: "Code Llama", contextWindow: 16384, supportsStreaming: true },
  { id: "gemma2", provider: "ollama", displayName: "Gemma 2", contextWindow: 8192, supportsStreaming: true },
];

// ── Provider configuration ────────────────────────────────────────

export function getProviderConfig(name: ProviderName): ProviderConfig | null {
  switch (name) {
    case "anthropic": {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return null;
      return {
        name: "anthropic",
        apiUrl: "https://api.anthropic.com/v1/messages",
        apiKey: key,
        defaultModel: "claude-sonnet-4-5",
        enabled: true,
      };
    }
    case "openai": {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return null;
      return {
        name: "openai",
        apiUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: key,
        defaultModel: "gpt-4o-mini",
        enabled: true,
      };
    }
    case "ollama": {
      const url = process.env.OLLAMA_URL || "http://localhost:11434";
      return {
        name: "ollama",
        apiUrl: `${url}/v1/chat/completions`,
        apiKey: "ollama",
        defaultModel: "llama3",
        enabled: true,
      };
    }
    default:
      return null;
  }
}

/**
 * Get all configured providers.
 */
export function getConfiguredProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  for (const name of ["anthropic", "openai", "ollama"] as ProviderName[]) {
    const config = getProviderConfig(name);
    if (config) providers.push(config);
  }
  return providers;
}

/**
 * Get the default provider based on configuration.
 */
export function getDefaultProvider(): ProviderName | null {
  const explicit = process.env.AI_DEFAULT_PROVIDER as ProviderName | undefined;
  if (explicit && getProviderConfig(explicit)) return explicit;

  // Priority: anthropic > openai > ollama
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "ollama";
}

// ── Request formatting ────────────────────────────────────────────

/**
 * Format a request for the Anthropic Messages API.
 */
export function formatAnthropicRequest(
  messages: MultiModelRequest["messages"],
  model: string,
  maxTokens: number,
  temperature: number,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  // Separate system message from the rest
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMsgs = messages.filter((m) => m.role !== "system");

  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: {
      model,
      max_tokens: maxTokens,
      temperature,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
    },
  };
}

/**
 * Format a request for OpenAI-compatible APIs (OpenAI, Ollama).
 */
export function formatOpenAIRequest(
  messages: MultiModelRequest["messages"],
  model: string,
  maxTokens: number,
  temperature: number,
  apiUrl: string,
  apiKey: string,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  return {
    url: apiUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
  };
}

// ── Response parsing ──────────────────────────────────────────────

/**
 * Parse an Anthropic Messages API response.
 */
export function parseAnthropicResponse(data: Record<string, unknown>): { content: string; tokensUsed: number } {
  const contentBlocks = data.content as Array<{ type: string; text?: string }> | undefined;
  const content = contentBlocks
    ?.filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("") || "";

  const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const tokensUsed = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);

  return { content, tokensUsed };
}

/**
 * Parse an OpenAI Chat Completions response.
 */
export function parseOpenAIResponse(data: Record<string, unknown>): { content: string; tokensUsed: number } {
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content || "";

  const usage = data.usage as { total_tokens?: number } | undefined;
  const tokensUsed = usage?.total_tokens || 0;

  return { content, tokensUsed };
}

// ── Multi-model completion ────────────────────────────────────────

/**
 * Send a completion request to the specified or default provider.
 */
export async function multiComplete(request: MultiModelRequest): Promise<MultiModelResponse> {
  const providerName = request.provider || getDefaultProvider();
  if (!providerName) {
    return { content: "No AI provider configured.", model: "none", provider: "ollama", cached: false };
  }

  const config = getProviderConfig(providerName);
  if (!config) {
    return { content: `Provider "${providerName}" is not configured.`, model: "none", provider: providerName, cached: false };
  }

  const model = request.model || config.defaultModel;
  const maxTokens = request.maxTokens || 1024;
  const temperature = request.temperature ?? 0.3;

  try {
    let formatted: { url: string; headers: Record<string, string>; body: Record<string, unknown> };

    if (providerName === "anthropic") {
      formatted = formatAnthropicRequest(request.messages, model, maxTokens, temperature);
    } else {
      formatted = formatOpenAIRequest(request.messages, model, maxTokens, temperature, config.apiUrl, config.apiKey);
    }

    const res = await fetch(formatted.url, {
      method: "POST",
      headers: formatted.headers,
      body: JSON.stringify(formatted.body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        content: `AI error — ${providerName} returned ${res.status}: ${errText.slice(0, 200)}`,
        model,
        provider: providerName,
        cached: false,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const parsed = providerName === "anthropic"
      ? parseAnthropicResponse(data)
      : parseOpenAIResponse(data);

    return {
      content: parsed.content || "No response from AI.",
      model,
      provider: providerName,
      cached: false,
      tokensUsed: parsed.tokensUsed,
    };
  } catch (err) {
    return {
      content: `AI error — could not connect to ${providerName}: ${(err as Error).message}`,
      model,
      provider: providerName,
      cached: false,
    };
  }
}

// ── Provider health check ─────────────────────────────────────────

export async function checkProviderHealth(name: ProviderName): Promise<{
  provider: ProviderName;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const config = getProviderConfig(name);
  if (!config) {
    return { provider: name, healthy: false, latencyMs: 0, error: "Not configured" };
  }

  const start = Date.now();
  try {
    if (name === "ollama") {
      const baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return { provider: name, healthy: res.ok, latencyMs: Date.now() - start };
    }

    // For Anthropic/OpenAI, just check the endpoint is reachable
    const url = name === "anthropic" ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/models";
    const headers: Record<string, string> = name === "anthropic"
      ? { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${config.apiKey}` };

    const res = await fetch(url, { method: name === "openai" ? "GET" : "POST", headers, signal: AbortSignal.timeout(5000) });
    // 401/403 means reachable but key issue; 400 means reachable (Anthropic returns 400 for empty body)
    const healthy = res.status < 500;
    return { provider: name, healthy, latencyMs: Date.now() - start };
  } catch (err) {
    return { provider: name, healthy: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

// ── Model discovery ───────────────────────────────────────────────

/**
 * List available models for a provider.
 * For Ollama, queries the local server. For others, returns known models.
 */
export async function listModels(provider: ProviderName): Promise<ModelInfo[]> {
  if (provider === "ollama") {
    try {
      const baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return KNOWN_MODELS.filter((m) => m.provider === "ollama");

      const data = (await res.json()) as { models?: Array<{ name: string }> };
      if (data.models) {
        return data.models.map((m) => ({
          id: m.name,
          provider: "ollama" as ProviderName,
          displayName: m.name,
          contextWindow: 8192,
          supportsStreaming: true,
        }));
      }
    } catch { /* fall through to known models */ }
  }

  return KNOWN_MODELS.filter((m) => m.provider === provider);
}

/**
 * Get a summary of all available providers and their status.
 */
export function getProviderSummary(): Array<{
  name: ProviderName;
  configured: boolean;
  defaultModel: string;
  isDefault: boolean;
}> {
  const defaultProvider = getDefaultProvider();
  return (["anthropic", "openai", "ollama"] as ProviderName[]).map((name) => {
    const config = getProviderConfig(name);
    return {
      name,
      configured: config !== null,
      defaultModel: config?.defaultModel || "",
      isDefault: name === defaultProvider,
    };
  });
}
