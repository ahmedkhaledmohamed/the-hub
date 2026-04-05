import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAiConfig,
  isAiConfigured,
  isOllamaDetected,
  resetOllamaDetection,
  complete,
  ask,
  promptCacheKey,
} from "@/lib/ai-client";

// Save original env at module load
const origEnv = {
  AI_GATEWAY_URL: process.env.AI_GATEWAY_URL,
  AI_GATEWAY_KEY: process.env.AI_GATEWAY_KEY,
  AI_MODEL: process.env.AI_MODEL,
  AI_PROVIDER: process.env.AI_PROVIDER,
};

describe("ai-client", () => {
  afterEach(() => {
    // Restore all AI env vars after each test
    for (const [key, val] of Object.entries(origEnv)) {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    }
    resetOllamaDetection();
  });
  describe("getAiConfig", () => {
    it("returns null when env vars are not set", () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;

      expect(getAiConfig()).toBeNull();

      // Restore
      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });

    it("returns config when env vars are set", () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      const origModel = process.env.AI_MODEL;

      process.env.AI_GATEWAY_URL = "https://api.example.com/v1/chat/completions";
      process.env.AI_GATEWAY_KEY = "test-key-123";
      process.env.AI_MODEL = "gpt-4";

      const config = getAiConfig();
      expect(config).not.toBeNull();
      expect(config!.gatewayUrl).toBe("https://api.example.com/v1/chat/completions");
      expect(config!.apiKey).toBe("test-key-123");
      expect(config!.model).toBe("gpt-4");

      // Restore
      if (origUrl) process.env.AI_GATEWAY_URL = origUrl; else delete process.env.AI_GATEWAY_URL;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey; else delete process.env.AI_GATEWAY_KEY;
      if (origModel) process.env.AI_MODEL = origModel; else delete process.env.AI_MODEL;
    });

    it("uses default model when AI_MODEL is not set", () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      const origModel = process.env.AI_MODEL;

      process.env.AI_GATEWAY_URL = "https://api.example.com";
      process.env.AI_GATEWAY_KEY = "key";
      delete process.env.AI_MODEL;

      const config = getAiConfig();
      expect(config!.model).toBe("claude-sonnet-4-5");

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl; else delete process.env.AI_GATEWAY_URL;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey; else delete process.env.AI_GATEWAY_KEY;
      if (origModel) process.env.AI_MODEL = origModel; else delete process.env.AI_MODEL;
    });
  });

  describe("isAiConfigured", () => {
    it("returns false when not configured and no Ollama", () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      const origProvider = process.env.AI_PROVIDER;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      delete process.env.AI_PROVIDER;
      resetOllamaDetection();

      expect(isAiConfigured()).toBe(false);

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
      if (origProvider) process.env.AI_PROVIDER = origProvider;
    });
  });

  describe("Ollama provider", () => {
    it("uses Ollama when AI_PROVIDER=ollama", () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      const origProvider = process.env.AI_PROVIDER;
      const origModel = process.env.AI_MODEL;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      process.env.AI_PROVIDER = "ollama";
      delete process.env.AI_MODEL;

      const config = getAiConfig();
      expect(config).not.toBeNull();
      expect(config!.gatewayUrl).toContain("localhost:11434");
      expect(config!.model).toBe("llama3");
      expect(config!.apiKey).toBe("ollama");

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl; else delete process.env.AI_GATEWAY_URL;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey; else delete process.env.AI_GATEWAY_KEY;
      if (origProvider) process.env.AI_PROVIDER = origProvider; else delete process.env.AI_PROVIDER;
      if (origModel) process.env.AI_MODEL = origModel; else delete process.env.AI_MODEL;
    });

    it("explicit gateway takes priority over Ollama", () => {
      process.env.AI_GATEWAY_URL = "https://custom.api.com/v1/chat/completions";
      process.env.AI_GATEWAY_KEY = "custom-key";
      process.env.AI_PROVIDER = "ollama";

      const config = getAiConfig();
      expect(config!.gatewayUrl).toBe("https://custom.api.com/v1/chat/completions");
      expect(config!.apiKey).toBe("custom-key");

      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      delete process.env.AI_PROVIDER;
    });

    it("resetOllamaDetection clears cached result", () => {
      resetOllamaDetection();
      expect(isOllamaDetected()).toBe(false);
    });

    it("isOllamaDetected returns false before detection", () => {
      resetOllamaDetection();
      expect(isOllamaDetected()).toBe(false);
    });
  });

  describe("complete", () => {
    it("returns unavailable message when AI is not configured", async () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      process.env.AI_PROVIDER = "none";

      const result = await complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toContain("AI unavailable");
      expect(result.cached).toBe(false);
      expect(result.model).toBe("none");

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });

    it("returns cached response when available", async () => {
      // First, manually insert a cache entry
      const { getDb } = await import("@/lib/db");
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_cache (
          cache_key TEXT PRIMARY KEY,
          response TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        )
      `);
      db.prepare(`
        INSERT OR REPLACE INTO ai_cache (cache_key, response, model, expires_at)
        VALUES ('test-cache-key', 'Cached answer', 'test-model', datetime('now', '+3600 seconds'))
      `).run();

      const result = await complete({
        messages: [{ role: "user", content: "test" }],
        cacheKey: "test-cache-key",
      });

      expect(result.content).toBe("Cached answer");
      expect(result.cached).toBe(true);
      expect(result.model).toBe("test-model");
    });

    it("skips expired cache entries", async () => {
      const { getDb } = await import("@/lib/db");
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_cache (
          cache_key TEXT PRIMARY KEY,
          response TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL
        )
      `);
      db.prepare(`
        INSERT OR REPLACE INTO ai_cache (cache_key, response, model, expires_at)
        VALUES ('expired-key', 'Old answer', 'old-model', datetime('now', '-1 seconds'))
      `).run();

      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      process.env.AI_PROVIDER = "none";

      const result = await complete({
        messages: [{ role: "user", content: "test" }],
        cacheKey: "expired-key",
      });

      // Should NOT return cached (expired) — falls through to "unavailable"
      expect(result.cached).toBe(false);
      expect(result.content).toContain("AI unavailable");

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });
  });

  describe("ask", () => {
    it("wraps a simple prompt into messages", async () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      process.env.AI_PROVIDER = "none";

      const result = await ask("Hello world");
      // Without config, returns unavailable
      expect(result.content).toContain("AI unavailable");

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });
  });

  describe("promptCacheKey", () => {
    it("generates consistent cache keys", () => {
      const key1 = promptCacheKey("test prompt");
      const key2 = promptCacheKey("test prompt");
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^ai:[a-f0-9]{64}$/);
    });

    it("generates different keys for different prompts", () => {
      const key1 = promptCacheKey("prompt A");
      const key2 = promptCacheKey("prompt B");
      expect(key1).not.toBe(key2);
    });
  });
});

// ── RAG pipeline tests ─────────────────────────────────────────────

import { askWorkspace, buildRagContext } from "@/lib/rag";
import { persistArtifacts } from "@/lib/db";
import type { Artifact } from "@/lib/types";

function makeRagArtifact(overrides: Partial<Artifact>): Artifact {
  return {
    path: "ws/doc.md", title: "Document", type: "md", group: "docs",
    modifiedAt: new Date().toISOString(), size: 500, staleDays: 1, ...overrides,
  };
}

describe("RAG pipeline", () => {
  afterEach(() => {
    for (const [key, val] of Object.entries(origEnv)) {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    }
    resetOllamaDetection();
  });

  beforeEach(() => {
    persistArtifacts([
      makeRagArtifact({ path: "rag/roadmap.md", title: "Q2 Roadmap", snippet: "Goals." }),
      makeRagArtifact({ path: "rag/pricing.md", title: "Pricing Strategy", snippet: "Tiers." }),
    ], new Map([
      ["rag/roadmap.md", "# Q2 Roadmap\n\nShip semantic search, plugin system, mobile PWA.\n\nStatus: on track, 80% complete."],
      ["rag/pricing.md", "# Pricing\n\nFree, Pro ($12/mo), Enterprise ($80/user). Enterprise includes SSO."],
    ]), { deleteStale: false });
  });

  it("returns unavailable when AI not configured", async () => {
    const origUrl = process.env.AI_GATEWAY_URL;
    const origKey = process.env.AI_GATEWAY_KEY;
    delete process.env.AI_GATEWAY_URL;
    delete process.env.AI_GATEWAY_KEY;
    process.env.AI_PROVIDER = "none";

    const result = await askWorkspace("What's the Q2 roadmap?");
    expect(result.answer).toContain("AI not configured");
    expect(result.sources).toEqual([]);

    if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
    if (origKey) process.env.AI_GATEWAY_KEY = origKey;
  });

  it("buildRagContext creates context from results", () => {
    const { context, sources } = buildRagContext([
      { path: "rag/roadmap.md", title: "Q2 Roadmap" },
      { path: "rag/pricing.md", title: "Pricing Strategy" },
    ]);
    expect(context).toContain("Q2 Roadmap");
    expect(context).toContain("Pricing");
    expect(sources.length).toBe(2);
  });

  it("buildRagContext skips missing artifacts", () => {
    const { sources } = buildRagContext([
      { path: "rag/nonexistent.md", title: "Missing" },
      { path: "rag/roadmap.md", title: "Q2 Roadmap" },
    ]);
    expect(sources.length).toBe(1);
    expect(sources[0].title).toBe("Q2 Roadmap");
  });

  it("buildRagContext returns empty for no results", () => {
    const { context, sources } = buildRagContext([]);
    expect(context).toBe("");
    expect(sources).toEqual([]);
  });
});

// ── Content generation tests ───────────────────────────────────────

import { generate, getTemplates } from "@/lib/generator";

describe("content generation", () => {
  afterEach(() => {
    for (const [key, val] of Object.entries(origEnv)) {
      if (val !== undefined) process.env[key] = val;
      else delete process.env[key];
    }
    resetOllamaDetection();
  });

  describe("getTemplates", () => {
    it("returns all template types", () => {
      const templates = getTemplates();
      expect(templates.length).toBe(4);
      expect(templates.map((t) => t.id)).toEqual(["status-update", "handoff-doc", "prd-outline", "custom"]);
    });

    it("templates have required fields", () => {
      for (const t of getTemplates()) {
        expect(t.label).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(typeof t.requiresGroup).toBe("boolean");
        expect(typeof t.requiresPaths).toBe("boolean");
      }
    });

    it("handoff-doc requires group, prd-outline requires paths", () => {
      const templates = getTemplates();
      const handoff = templates.find((t) => t.id === "handoff-doc");
      const prd = templates.find((t) => t.id === "prd-outline");
      expect(handoff!.requiresGroup).toBe(true);
      expect(prd!.requiresPaths).toBe(true);
    });
  });

  describe("generate", () => {
    it("returns unavailable when AI not configured", async () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
      process.env.AI_PROVIDER = "none";

      const result = await generate({ template: "status-update" });
      expect(result.content).toContain("AI not configured");
      expect(result.model).toBe("none");

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });

    it("throws for handoff-doc without groupId", async () => {
      process.env.AI_GATEWAY_URL = "http://fake";
      process.env.AI_GATEWAY_KEY = "fake";

      await expect(generate({ template: "handoff-doc" })).rejects.toThrow("groupId required");

      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
    });

    it("throws for prd-outline without paths", async () => {
      process.env.AI_GATEWAY_URL = "http://fake";
      process.env.AI_GATEWAY_KEY = "fake";

      await expect(generate({ template: "prd-outline" })).rejects.toThrow("artifactPaths required");

      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
    });

    it("throws for custom without prompt", async () => {
      process.env.AI_GATEWAY_URL = "http://fake";
      process.env.AI_GATEWAY_KEY = "fake";

      await expect(generate({ template: "custom" })).rejects.toThrow("customPrompt required");

      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
    });

    it("throws for unknown template", async () => {
      process.env.AI_GATEWAY_URL = "http://fake";
      process.env.AI_GATEWAY_KEY = "fake";

      await expect(generate({ template: "nonexistent" as any })).rejects.toThrow("Unknown template");

      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;
    });
  });
});

// ── Multi-model AI tests ─────────────────────────────────────────

import {
  getProviderConfig,
  getConfiguredProviders,
  getDefaultProvider,
  getProviderSummary,
  formatAnthropicRequest,
  formatOpenAIRequest,
  parseAnthropicResponse,
  parseOpenAIResponse,
  listModels,
  KNOWN_MODELS,
} from "@/lib/multi-model";
import type { ProviderName } from "@/lib/multi-model";

describe("multi-model AI", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("getProviderConfig", () => {
    it("returns null for anthropic without key", () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(getProviderConfig("anthropic")).toBeNull();
    });

    it("returns config for anthropic with key", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      const config = getProviderConfig("anthropic");
      expect(config).not.toBeNull();
      expect(config!.name).toBe("anthropic");
      expect(config!.apiUrl).toContain("anthropic.com");
      expect(config!.defaultModel).toContain("claude");
    });

    it("returns null for openai without key", () => {
      delete process.env.OPENAI_API_KEY;
      expect(getProviderConfig("openai")).toBeNull();
    });

    it("returns config for openai with key", () => {
      process.env.OPENAI_API_KEY = "sk-test";
      const config = getProviderConfig("openai");
      expect(config).not.toBeNull();
      expect(config!.name).toBe("openai");
      expect(config!.apiUrl).toContain("openai.com");
    });

    it("always returns config for ollama", () => {
      const config = getProviderConfig("ollama");
      expect(config).not.toBeNull();
      expect(config!.name).toBe("ollama");
      expect(config!.defaultModel).toBe("llama3");
    });

    it("respects custom OLLAMA_URL", () => {
      process.env.OLLAMA_URL = "http://myserver:11434";
      const config = getProviderConfig("ollama");
      expect(config!.apiUrl).toContain("myserver:11434");
    });

    it("returns null for unknown provider", () => {
      expect(getProviderConfig("unknown" as ProviderName)).toBeNull();
    });
  });

  describe("getConfiguredProviders", () => {
    it("includes ollama by default", () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const providers = getConfiguredProviders();
      expect(providers.some((p) => p.name === "ollama")).toBe(true);
    });

    it("includes all configured providers", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      process.env.OPENAI_API_KEY = "sk-test";
      const providers = getConfiguredProviders();
      expect(providers.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("getDefaultProvider", () => {
    it("respects AI_DEFAULT_PROVIDER env", () => {
      process.env.AI_DEFAULT_PROVIDER = "ollama";
      expect(getDefaultProvider()).toBe("ollama");
    });

    it("prefers anthropic when configured", () => {
      delete process.env.AI_DEFAULT_PROVIDER;
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      delete process.env.OPENAI_API_KEY;
      expect(getDefaultProvider()).toBe("anthropic");
    });

    it("falls back to openai", () => {
      delete process.env.AI_DEFAULT_PROVIDER;
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = "sk-test";
      expect(getDefaultProvider()).toBe("openai");
    });

    it("falls back to ollama", () => {
      delete process.env.AI_DEFAULT_PROVIDER;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      expect(getDefaultProvider()).toBe("ollama");
    });
  });

  describe("formatAnthropicRequest", () => {
    it("separates system message", () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const messages = [
        { role: "system" as const, content: "You are helpful." },
        { role: "user" as const, content: "Hello" },
      ];
      const req = formatAnthropicRequest(messages, "claude-sonnet-4-5", 1024, 0.3);
      expect(req.body.system).toBe("You are helpful.");
      expect(req.body.messages).toEqual([{ role: "user", content: "Hello" }]);
      expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    });

    it("works without system message", () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      const messages = [{ role: "user" as const, content: "Hello" }];
      const req = formatAnthropicRequest(messages, "claude-sonnet-4-5", 512, 0.5);
      expect(req.body.system).toBeUndefined();
      expect(req.body.max_tokens).toBe(512);
      expect(req.body.temperature).toBe(0.5);
    });
  });

  describe("formatOpenAIRequest", () => {
    it("formats messages for OpenAI API", () => {
      const messages = [
        { role: "system" as const, content: "Be concise." },
        { role: "user" as const, content: "Hi" },
      ];
      const req = formatOpenAIRequest(messages, "gpt-4o", 1024, 0.3, "https://api.openai.com/v1/chat/completions", "sk-test");
      expect(req.body.model).toBe("gpt-4o");
      expect(req.body.messages).toHaveLength(2);
      expect(req.headers.Authorization).toBe("Bearer sk-test");
    });
  });

  describe("parseAnthropicResponse", () => {
    it("extracts text from content blocks", () => {
      const data = {
        content: [{ type: "text", text: "Hello world" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
      const result = parseAnthropicResponse(data);
      expect(result.content).toBe("Hello world");
      expect(result.tokensUsed).toBe(15);
    });

    it("concatenates multiple text blocks", () => {
      const data = {
        content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: " Part 2" },
        ],
      };
      expect(parseAnthropicResponse(data).content).toBe("Part 1 Part 2");
    });

    it("handles empty response", () => {
      expect(parseAnthropicResponse({}).content).toBe("");
    });
  });

  describe("parseOpenAIResponse", () => {
    it("extracts content from choices", () => {
      const data = {
        choices: [{ message: { content: "Hello" } }],
        usage: { total_tokens: 20 },
      };
      const result = parseOpenAIResponse(data);
      expect(result.content).toBe("Hello");
      expect(result.tokensUsed).toBe(20);
    });

    it("handles empty response", () => {
      expect(parseOpenAIResponse({}).content).toBe("");
    });
  });

  describe("KNOWN_MODELS", () => {
    it("includes models for all providers", () => {
      const providers = new Set(KNOWN_MODELS.map((m) => m.provider));
      expect(providers.has("anthropic")).toBe(true);
      expect(providers.has("openai")).toBe(true);
      expect(providers.has("ollama")).toBe(true);
    });

    it("all models have required fields", () => {
      for (const model of KNOWN_MODELS) {
        expect(model.id).toBeTruthy();
        expect(model.displayName).toBeTruthy();
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(typeof model.supportsStreaming).toBe("boolean");
      }
    });
  });

  describe("listModels", () => {
    it("returns known models for anthropic", async () => {
      const models = await listModels("anthropic");
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) expect(m.provider).toBe("anthropic");
    });

    it("returns known models for openai", async () => {
      const models = await listModels("openai");
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) expect(m.provider).toBe("openai");
    });
  });

  describe("getProviderSummary", () => {
    it("returns summary for all providers", () => {
      const summary = getProviderSummary();
      expect(summary.length).toBe(3);
      const names = summary.map((s) => s.name);
      expect(names).toContain("anthropic");
      expect(names).toContain("openai");
      expect(names).toContain("ollama");
    });

    it("marks exactly one as default", () => {
      const summary = getProviderSummary();
      const defaults = summary.filter((s) => s.isDefault);
      expect(defaults.length).toBe(1);
    });
  });
});

// ── Circuit breaker tests ────────────────────────────────────────

import {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  getCircuitBreaker,
  getAllCircuitBreakerStatus,
  resetAllCircuitBreakers,
} from "@/lib/circuit-breaker";

describe("circuit breaker", () => {
  afterEach(() => {
    resetAllCircuitBreakers();
  });

  describe("CircuitBreaker", () => {
    it("starts in closed state", () => {
      const cb = new CircuitBreaker({ name: "test-closed" });
      expect(cb.getStatus().state).toBe("closed");
      expect(cb.getStatus().consecutiveFailures).toBe(0);
    });

    it("passes through successful calls", async () => {
      const cb = new CircuitBreaker({ name: "test-success" });
      const result = await cb.execute(async () => 42);
      expect(result).toBe(42);
      expect(cb.getStatus().totalSuccesses).toBe(1);
      expect(cb.getStatus().consecutiveFailures).toBe(0);
    });

    it("tracks consecutive failures", async () => {
      const cb = new CircuitBreaker({ name: "test-failures", failureThreshold: 5 });
      for (let i = 0; i < 2; i++) {
        await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
      }
      expect(cb.getStatus().consecutiveFailures).toBe(2);
      expect(cb.getStatus().state).toBe("closed"); // not yet at threshold
    });

    it("opens after failure threshold", async () => {
      const cb = new CircuitBreaker({ name: "test-open", failureThreshold: 3 });
      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      }
      expect(cb.getStatus().state).toBe("open");
      expect(cb.getStatus().openedAt).not.toBeNull();
    });

    it("rejects immediately when open", async () => {
      const cb = new CircuitBreaker({ name: "test-reject", failureThreshold: 1, cooldownMs: 60000 });
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe("open");

      // Next call should throw CircuitOpenError without executing the function
      await expect(cb.execute(async () => 42)).rejects.toThrow(CircuitOpenError);
    });

    it("transitions to half_open after cooldown", async () => {
      const cb = new CircuitBreaker({ name: "test-halfopen", failureThreshold: 1, cooldownMs: 1 }); // 1ms cooldown
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe("open");

      // Wait for cooldown
      await new Promise((r) => setTimeout(r, 10));

      // Next call should succeed and move to closed
      const result = await cb.execute(async () => "recovered");
      expect(result).toBe("recovered");
      expect(cb.getStatus().state).toBe("closed");
    });

    it("returns to open if half_open test fails", async () => {
      const cb = new CircuitBreaker({ name: "test-halfopen-fail", failureThreshold: 1, cooldownMs: 1 });
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();

      await new Promise((r) => setTimeout(r, 10));

      // half_open test request also fails
      await expect(cb.execute(async () => { throw new Error("still broken"); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe("open");
    });

    it("resets consecutive failures on success", async () => {
      const cb = new CircuitBreaker({ name: "test-reset", failureThreshold: 5 });
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      expect(cb.getStatus().consecutiveFailures).toBe(2);

      await cb.execute(async () => "ok");
      expect(cb.getStatus().consecutiveFailures).toBe(0);
    });

    it("manual reset clears state", async () => {
      const cb = new CircuitBreaker({ name: "test-manual-reset", failureThreshold: 1, cooldownMs: 60000 });
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe("open");

      cb.reset();
      expect(cb.getStatus().state).toBe("closed");
      expect(cb.getStatus().consecutiveFailures).toBe(0);
    });

    it("throws TimeoutError on abort", async () => {
      const cb = new CircuitBreaker({ name: "test-timeout", timeoutMs: 10 });
      await expect(cb.execute(async (signal) => {
        // Simulate slow operation — wait until aborted
        return new Promise((resolve, reject) => {
          const check = setInterval(() => {
            if (signal.aborted) { clearInterval(check); reject(new DOMException("aborted", "AbortError")); }
          }, 1);
        });
      })).rejects.toThrow(TimeoutError);
    });

    it("reports timeout in ms", async () => {
      const cb = new CircuitBreaker({ name: "test-timeout-ms", timeoutMs: 50 });
      try {
        await cb.execute(async (signal) => {
          return new Promise((_, reject) => {
            const check = setInterval(() => {
              if (signal.aborted) { clearInterval(check); reject(new DOMException("aborted", "AbortError")); }
            }, 1);
          });
        });
      } catch (err) {
        expect(err).toBeInstanceOf(TimeoutError);
        expect((err as TimeoutError).timeoutMs).toBe(50);
      }
    });
  });

  describe("getCircuitBreaker (singleton)", () => {
    it("returns the same instance for the same name", () => {
      const a = getCircuitBreaker("singleton-test");
      const b = getCircuitBreaker("singleton-test");
      expect(a).toBe(b);
    });

    it("returns different instances for different names", () => {
      const a = getCircuitBreaker("name-a");
      const b = getCircuitBreaker("name-b");
      expect(a).not.toBe(b);
    });
  });

  describe("getAllCircuitBreakerStatus", () => {
    it("returns status for all breakers", () => {
      getCircuitBreaker("status-a");
      getCircuitBreaker("status-b");
      const all = getAllCircuitBreakerStatus();
      expect(all.length).toBeGreaterThanOrEqual(2);
      for (const s of all) {
        expect(s.name).toBeTruthy();
        expect(["closed", "open", "half_open"]).toContain(s.state);
      }
    });
  });

  describe("resetAllCircuitBreakers", () => {
    it("resets all to closed", async () => {
      const cb = getCircuitBreaker("reset-all-test", { failureThreshold: 1, cooldownMs: 60000 });
      await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
      expect(cb.getStatus().state).toBe("open");

      resetAllCircuitBreakers();
      expect(cb.getStatus().state).toBe("closed");
    });
  });
});

// ── Hygiene batch actions tests ──────────────────────────────────

import { analyzeHygiene } from "@/lib/hygiene-analyzer";
import type { Artifact } from "@/lib/types";

describe("hygiene batch actions", () => {
  describe("batch selection logic", () => {
    it("select all adds all finding IDs", () => {
      const findings = [
        { id: "f1" }, { id: "f2" }, { id: "f3" },
      ];
      const selected = new Set(findings.map((f) => f.id));
      expect(selected.size).toBe(3);
      expect(selected.has("f1")).toBe(true);
      expect(selected.has("f3")).toBe(true);
    });

    it("toggle adds and removes", () => {
      const selected = new Set<string>();
      // Toggle on
      selected.add("f1");
      expect(selected.has("f1")).toBe(true);
      // Toggle off
      selected.delete("f1");
      expect(selected.has("f1")).toBe(false);
    });

    it("select none clears all", () => {
      const selected = new Set(["f1", "f2", "f3"]);
      selected.clear();
      expect(selected.size).toBe(0);
    });
  });

  describe("batch path collection", () => {
    it("collects unique paths from selected findings", () => {
      const findings = [
        { id: "f1", artifacts: [{ path: "a.md" }, { path: "b.md" }] },
        { id: "f2", artifacts: [{ path: "b.md" }, { path: "c.md" }] },
      ];
      const selectedIds = new Set(["f1", "f2"]);
      const selectedFindings = findings.filter((f) => selectedIds.has(f.id));
      const paths = new Set<string>();
      for (const f of selectedFindings) {
        for (const a of f.artifacts) paths.add(a.path);
      }
      expect(paths.size).toBe(3); // a, b, c (deduplicated)
      expect(paths.has("b.md")).toBe(true);
    });

    it("empty selection yields no paths", () => {
      const selectedIds = new Set<string>();
      expect(selectedIds.size).toBe(0);
    });
  });

  describe("analyzeHygiene returns findings for batch UI", () => {
    it("returns report structure with findings array", () => {
      const report = analyzeHygiene([], new Date().toISOString());
      expect(Array.isArray(report.findings)).toBe(true);
      expect(typeof report.stats.totalFindings).toBe("number");
      expect(typeof report.stats.filesAnalyzed).toBe("number");
    });

    it("findings have id, type, severity, artifacts", () => {
      const artifacts: Artifact[] = [
        { path: "batch/a.md", title: "Doc A", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 100, staleDays: 1, snippet: "test" },
      ];
      const report = analyzeHygiene(artifacts, new Date().toISOString());
      for (const f of report.findings) {
        expect(f.id).toBeTruthy();
        expect(f.type).toBeTruthy();
        expect(f.severity).toBeTruthy();
        expect(Array.isArray(f.artifacts)).toBe(true);
      }
    });
  });
});

// ── Pre-meeting briefing tests ───────────────────────────────────

import { generateMeetingBriefing, formatDailyBriefings } from "@/lib/meeting-briefing";
import type { MeetingBriefing, DailyBriefingReport } from "@/lib/meeting-briefing";

describe("pre-meeting briefings", () => {
  describe("generateMeetingBriefing", () => {
    it("returns valid briefing structure", () => {
      const briefing = generateMeetingBriefing("Sprint Planning", "2026-04-05T14:00:00Z");
      expect(briefing.eventTitle).toBe("Sprint Planning");
      expect(briefing.eventTime).toBe("2026-04-05T14:00:00Z");
      expect(typeof briefing.minutesUntil).toBe("number");
      expect(briefing.context).toBeDefined();
      expect(Array.isArray(briefing.actionItems)).toBe(true);
      expect(["high", "medium", "low"]).toContain(briefing.priority);
      expect(typeof briefing.briefingText).toBe("string");
      expect(briefing.generatedAt).toBeTruthy();
    });

    it("includes context packet with related docs", () => {
      const briefing = generateMeetingBriefing("Architecture Review", "2026-04-05T14:00:00Z");
      expect(briefing.context.eventTitle).toBe("Architecture Review");
      expect(Array.isArray(briefing.context.relatedDocs)).toBe(true);
      expect(Array.isArray(briefing.context.recentDecisions)).toBe(true);
    });

    it("generates action items from context", () => {
      const briefing = generateMeetingBriefing("Technical Discussion", "2026-04-05T14:00:00Z");
      expect(Array.isArray(briefing.actionItems)).toBe(true);
      // Should always have at least a time-based action
    });

    it("respects changeDays option", () => {
      const briefing = generateMeetingBriefing("Q3 Review", "2026-04-05T14:00:00Z", { changeDays: 14 });
      expect(briefing).toBeDefined();
    });

    it("briefing text contains meeting title", () => {
      const briefing = generateMeetingBriefing("Budget Review", "2026-04-05T14:00:00Z");
      expect(briefing.briefingText).toContain("Budget Review");
    });

    it("computes minutes until meeting", () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1hr from now
      const briefing = generateMeetingBriefing("Test", futureTime);
      expect(briefing.minutesUntil).toBeGreaterThan(50);
      expect(briefing.minutesUntil).toBeLessThan(70);
    });
  });

  describe("priority scoring", () => {
    it("low priority for meetings with no signals", () => {
      const briefing = generateMeetingBriefing("xyznonexist999 zzzmatch777", "2026-04-05T14:00:00Z");
      expect(briefing.priority).toBe("low");
    });
  });

  describe("formatDailyBriefings", () => {
    it("formats empty report", () => {
      const report: DailyBriefingReport = {
        date: "2026-04-05",
        meetings: [],
        totalMeetings: 0,
        highPriority: 0,
        generatedAt: new Date().toISOString(),
      };
      const text = formatDailyBriefings(report);
      expect(text).toContain("No meetings today");
    });

    it("formats report with meetings", () => {
      const briefing = generateMeetingBriefing("Test Meeting", "2026-04-05T14:00:00Z");
      const report: DailyBriefingReport = {
        date: "2026-04-05",
        meetings: [briefing],
        totalMeetings: 1,
        highPriority: 0,
        generatedAt: new Date().toISOString(),
      };
      const text = formatDailyBriefings(report);
      expect(text).toContain("Daily Meeting Briefings");
      expect(text).toContain("Test Meeting");
    });
  });
});
