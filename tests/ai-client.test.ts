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
