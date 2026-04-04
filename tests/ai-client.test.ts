import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAiConfig,
  isAiConfigured,
  complete,
  ask,
  promptCacheKey,
} from "@/lib/ai-client";

describe("ai-client", () => {
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
    it("returns false when not configured", () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;

      expect(isAiConfigured()).toBe(false);

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });
  });

  describe("complete", () => {
    it("returns unavailable message when AI is not configured", async () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;

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
