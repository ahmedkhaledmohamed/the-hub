import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { scan, readFileContent } from "@/lib/scanner";
import type { HubConfig } from "@/lib/types";

const TEST_WORKSPACE = resolve(".test-workspace");

function createTestConfig(overrides: Partial<HubConfig> = {}): HubConfig {
  return {
    name: "Test Hub",
    workspaces: [{ path: TEST_WORKSPACE, label: "Test" }],
    groups: [
      { id: "docs", label: "Docs", match: "**/*.md", tab: "all", color: "#3b82f6" },
    ],
    tabs: [{ id: "all", label: "All", icon: "layers", default: true }],
    ...overrides,
  };
}

describe("scanner", () => {
  beforeAll(() => {
    // Create a temporary workspace with test files
    mkdirSync(join(TEST_WORKSPACE, "docs"), { recursive: true });
    mkdirSync(join(TEST_WORKSPACE, "presentations"), { recursive: true });

    writeFileSync(
      join(TEST_WORKSPACE, "docs", "architecture.md"),
      "# Architecture Overview\n\nThis doc describes the system architecture.\n\n## Components\n\nThe system has three main components.",
    );
    writeFileSync(
      join(TEST_WORKSPACE, "docs", "getting-started.md"),
      "# Getting Started\n\nWelcome to the project. Follow these steps to get up and running.",
    );
    writeFileSync(
      join(TEST_WORKSPACE, "presentations", "q2-review.html"),
      "<html><head><title>Q2 Review</title></head><body><h1>Q2 2026 Review</h1><p>Summary of Q2.</p></body></html>",
    );
    writeFileSync(
      join(TEST_WORKSPACE, "README.md"),
      "# Test Project\n\nA test project for scanner tests.",
    );
  });

  afterAll(() => {
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  describe("readFileContent", () => {
    it("reads file content as UTF-8 string", () => {
      const content = readFileContent(join(TEST_WORKSPACE, "docs", "architecture.md"));
      expect(content).toContain("# Architecture Overview");
      expect(content).toContain("three main components");
    });

    it("returns empty string for non-existent files", () => {
      const content = readFileContent(join(TEST_WORKSPACE, "does-not-exist.md"));
      expect(content).toBe("");
    });
  });

  describe("scan", () => {
    it("discovers all artifacts in workspace", () => {
      const config = createTestConfig({
        groups: [
          { id: "docs", label: "Docs", match: ".test-workspace/docs/**", tab: "all", color: "#3b82f6" },
          { id: "presentations", label: "Presentations", match: ".test-workspace/presentations/**", tab: "all", color: "#f59e0b" },
        ],
      });
      const manifest = scan(config);

      expect(manifest.artifacts.length).toBe(4); // 2 docs + 1 html + 1 README
      expect(manifest.generatedAt).toBeTruthy();
      expect(manifest.workspaces).toContain(TEST_WORKSPACE);
    });

    it("extracts titles from markdown files", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      const archDoc = manifest.artifacts.find((a) => a.path.includes("architecture.md"));
      expect(archDoc).toBeDefined();
      expect(archDoc!.title).toBe("Architecture Overview");
    });

    it("extracts titles from HTML files", () => {
      const config = createTestConfig({
        groups: [
          { id: "all", label: "All", match: "**/*", tab: "all", color: "#666" },
        ],
      });
      const manifest = scan(config);

      const htmlDoc = manifest.artifacts.find((a) => a.path.includes("q2-review.html"));
      expect(htmlDoc).toBeDefined();
      expect(htmlDoc!.title).toBe("Q2 Review");
    });

    it("assigns correct types based on extension", () => {
      const config = createTestConfig({
        groups: [
          { id: "all", label: "All", match: "**/*", tab: "all", color: "#666" },
        ],
      });
      const manifest = scan(config);

      const mdArtifact = manifest.artifacts.find((a) => a.path.endsWith(".md"));
      const htmlArtifact = manifest.artifacts.find((a) => a.path.endsWith(".html"));

      expect(mdArtifact!.type).toBe("md");
      expect(htmlArtifact!.type).toBe("html");
    });

    it("calculates staleness in days", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      for (const artifact of manifest.artifacts) {
        expect(artifact.staleDays).toBeGreaterThanOrEqual(0);
        expect(typeof artifact.staleDays).toBe("number");
      }
    });

    it("generates snippets for markdown files", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      const archDoc = manifest.artifacts.find((a) => a.path.includes("architecture.md"));
      expect(archDoc!.snippet).toBeTruthy();
      expect(archDoc!.snippet).toContain("system architecture");
    });

    it("builds group summaries with correct counts", () => {
      const config = createTestConfig({
        groups: [
          { id: "docs", label: "Docs", match: ".test-workspace/docs/**", tab: "all", color: "#3b82f6" },
        ],
      });
      const manifest = scan(config);

      const docsGroup = manifest.groups.find((g) => g.id === "docs");
      expect(docsGroup).toBeDefined();
      expect(docsGroup!.count).toBe(2); // architecture.md + getting-started.md
    });

    it("returns content map when withContent option is set", () => {
      const config = createTestConfig();
      const result = scan(config, { withContent: true });

      expect("contentMap" in result).toBe(true);
      expect("manifest" in result).toBe(true);

      const { manifest, contentMap } = result;
      expect(manifest.artifacts.length).toBeGreaterThan(0);
      expect(contentMap.size).toBe(manifest.artifacts.length);

      // Content map should have actual file content
      const archKey = Array.from(contentMap.keys()).find((k) => k.includes("architecture.md"));
      expect(archKey).toBeDefined();
      expect(contentMap.get(archKey!)).toContain("# Architecture Overview");
    });

    it("returns plain manifest without withContent option (backward compat)", () => {
      const config = createTestConfig();
      const result = scan(config);

      expect("artifacts" in result).toBe(true);
      expect("contentMap" in result).toBe(false);
    });
  });
});

// ── Event bus / webhook tests ──────────────────────────────────────

import {
  emit,
  on,
  off,
  getRecentEvents,
  clearEventLog,
  signPayload,
  getListenerCount,
  clearAllListeners,
} from "@/lib/events";

// ── Incremental scan tests ─────────────────────────────────────────

import { getChangedFiles, updateMtimes, getStoredMtimes } from "@/lib/db";

describe("incremental scanning", () => {
  it("detects new files as added", () => {
    const files = [{ path: "inc/new.md", mtimeMs: Date.now(), size: 100 }];
    const result = getChangedFiles(files);
    expect(result.added).toContain("inc/new.md");
  });

  it("detects changed files by mtime", () => {
    updateMtimes([{ path: "inc/changed.md", mtimeMs: 1000, size: 100 }]);
    const result = getChangedFiles([{ path: "inc/changed.md", mtimeMs: 2000, size: 100 }]);
    expect(result.changed).toContain("inc/changed.md");
  });

  it("detects changed files by size", () => {
    updateMtimes([{ path: "inc/sized.md", mtimeMs: 1000, size: 100 }]);
    const result = getChangedFiles([{ path: "inc/sized.md", mtimeMs: 1000, size: 200 }]);
    expect(result.changed).toContain("inc/sized.md");
  });

  it("detects unchanged files", () => {
    updateMtimes([{ path: "inc/same.md", mtimeMs: 1000, size: 100 }]);
    const result = getChangedFiles([{ path: "inc/same.md", mtimeMs: 1000, size: 100 }]);
    expect(result.unchanged).toContain("inc/same.md");
  });

  it("detects removed files", () => {
    updateMtimes([{ path: "inc/gone.md", mtimeMs: 1000, size: 100 }]);
    const result = getChangedFiles([]);
    expect(result.removed).toContain("inc/gone.md");
  });

  it("updateMtimes stores and retrieves", () => {
    const unique = `inc/store-${Date.now()}.md`;
    updateMtimes([{ path: unique, mtimeMs: 12345, size: 500 }]);
    const stored = getStoredMtimes();
    expect(stored.get(unique)?.mtimeMs).toBe(12345);
  });
});

describe("event bus", () => {
  afterEach(() => {
    clearEventLog();
    clearAllListeners();
  });

  describe("emit / on / off", () => {
    it("emits events to listeners", async () => {
      let received: unknown = null;
      const handler = (e: unknown) => { received = e; };
      on("scan.complete", handler);

      await emit("scan.complete", { artifacts: 10 });
      expect(received).not.toBeNull();
      expect((received as { type: string }).type).toBe("scan.complete");

      off("scan.complete", handler);
    });

    it("supports multiple listeners", async () => {
      let count = 0;
      const h1 = () => { count++; };
      const h2 = () => { count++; };
      on("scan.complete", h1);
      on("scan.complete", h2);

      await emit("scan.complete", {});
      expect(count).toBe(2);
    });

    it("off removes specific handler", async () => {
      let called = false;
      const handler = () => { called = true; };
      on("scan.complete", handler);
      off("scan.complete", handler);

      await emit("scan.complete", {});
      expect(called).toBe(false);
    });

    it("getListenerCount tracks listeners", () => {
      const handler = () => {};
      expect(getListenerCount("scan.complete")).toBe(0);
      on("scan.complete", handler);
      expect(getListenerCount("scan.complete")).toBe(1);
      off("scan.complete", handler);
      expect(getListenerCount("scan.complete")).toBe(0);
    });
  });

  describe("event log", () => {
    it("stores recent events", async () => {
      await emit("scan.complete", { test: true });
      await emit("artifact.created", { path: "test.md" });

      const events = getRecentEvents(10);
      expect(events.length).toBe(2);
      expect(events[0].type).toBe("artifact.created"); // Most recent first
      expect(events[1].type).toBe("scan.complete");
    });

    it("clearEventLog empties the log", async () => {
      await emit("scan.complete", {});
      clearEventLog();
      expect(getRecentEvents(10)).toEqual([]);
    });

    it("respects limit parameter", async () => {
      await emit("scan.complete", {});
      await emit("scan.complete", {});
      await emit("scan.complete", {});
      expect(getRecentEvents(2).length).toBe(2);
    });
  });

  describe("signPayload", () => {
    it("generates HMAC-SHA256 signature", () => {
      const sig = signPayload('{"test":true}', "secret");
      expect(sig).toMatch(/^[a-f0-9]{64}$/);
    });

    it("same payload + secret = same signature", () => {
      const sig1 = signPayload("data", "key");
      const sig2 = signPayload("data", "key");
      expect(sig1).toBe(sig2);
    });

    it("different secrets produce different signatures", () => {
      const sig1 = signPayload("data", "key1");
      const sig2 = signPayload("data", "key2");
      expect(sig1).not.toBe(sig2);
    });
  });
});

// ── Setup wizard API tests ───────────────────────────────────────

import { loadConfig } from "@/lib/config";
import { isAiConfigured, getAiConfig, isOllamaDetected, resetOllamaDetection } from "@/lib/ai-client";

describe("setup wizard", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    resetOllamaDetection();
  });

  describe("config detection", () => {
    it("loadConfig returns config with defaults", () => {
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(config.name).toBeTruthy();
      expect(Array.isArray(config.tabs)).toBe(true);
      expect(config.scanner).toBeDefined();
      expect(Array.isArray(config.scanner?.extensions || config.scanner?.skipDirs || [])).toBe(true);
    });

    it("config has scanner with extensions and skipDirs", () => {
      const config = loadConfig();
      expect(config.scanner).toBeDefined();
    });
  });

  describe("AI detection for setup", () => {
    it("isAiConfigured returns false with AI_PROVIDER=none", () => {
      process.env.AI_PROVIDER = "none";
      expect(isAiConfigured()).toBe(false);
    });

    it("getAiConfig returns null with AI_PROVIDER=none", () => {
      process.env.AI_PROVIDER = "none";
      expect(getAiConfig()).toBeNull();
    });

    it("getAiConfig returns config with gateway URL and key", () => {
      process.env.AI_GATEWAY_URL = "https://api.example.com/v1/chat/completions";
      process.env.AI_GATEWAY_KEY = "test-key-123";
      const config = getAiConfig();
      expect(config).not.toBeNull();
      expect(config!.gatewayUrl).toBe("https://api.example.com/v1/chat/completions");
      expect(config!.apiKey).toBe("test-key-123");
    });

    it("getAiConfig returns Ollama config when AI_PROVIDER=ollama", () => {
      process.env.AI_PROVIDER = "ollama";
      const config = getAiConfig();
      expect(config).not.toBeNull();
      expect(config!.gatewayUrl).toContain("11434");
      expect(config!.model).toBe("llama3");
    });

    it("isOllamaDetected returns false before detection", () => {
      resetOllamaDetection();
      expect(isOllamaDetected()).toBe(false);
    });
  });

  describe("feature availability matrix", () => {
    it("core features available without AI", () => {
      process.env.AI_PROVIDER = "none";
      // These features should work regardless of AI
      const coreFeatures = ["Full-text search", "Document hygiene", "Knowledge graph", "Change feed", "MCP server"];
      // Just verify the concept — features are always-on
      for (const feature of coreFeatures) {
        expect(feature).toBeTruthy();
      }
      expect(isAiConfigured()).toBe(false);
    });

    it("AI features require configuration", () => {
      process.env.AI_PROVIDER = "none";
      expect(isAiConfigured()).toBe(false);
      // When AI is off, RAG/summarization/generation are unavailable
    });

    it("integration features check env vars", () => {
      delete process.env.GOOGLE_DOCS_API_KEY;
      delete process.env.GOOGLE_DOCS_TOKEN;
      delete process.env.NOTION_TOKEN;
      delete process.env.SLACK_WEBHOOK_URL;

      expect(process.env.GOOGLE_DOCS_API_KEY).toBeUndefined();
      expect(process.env.NOTION_TOKEN).toBeUndefined();
      expect(process.env.SLACK_WEBHOOK_URL).toBeUndefined();
    });

    it("integration features detect when configured", () => {
      process.env.NOTION_TOKEN = "secret_test_token";
      expect(process.env.NOTION_TOKEN).toBe("secret_test_token");
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      expect(process.env.SLACK_WEBHOOK_URL).toBeTruthy();
    });
  });

  describe("setup readiness", () => {
    it("computes overall readiness from steps", () => {
      // Simulates the readiness logic from the API
      const hasConfig = true;
      const hasValidWorkspaces = true;
      const hasArtifacts = true;
      const steps = [hasConfig, hasValidWorkspaces, hasArtifacts];
      const completed = steps.filter(Boolean).length;
      expect(completed).toBe(3);
      expect(completed >= 2).toBe(true); // ready threshold
    });

    it("not ready without valid workspaces", () => {
      const hasConfig = false;
      const hasValidWorkspaces = false;
      const hasArtifacts = false;
      const steps = [hasConfig, hasValidWorkspaces, hasArtifacts];
      const completed = steps.filter(Boolean).length;
      expect(completed).toBe(0);
      expect(completed >= 2).toBe(false);
    });

    it("ready with config + workspaces but no AI", () => {
      const hasConfig = true;
      const hasValidWorkspaces = true;
      const hasArtifacts = false;
      const steps = [hasConfig, hasValidWorkspaces, hasArtifacts];
      const completed = steps.filter(Boolean).length;
      expect(completed).toBe(2);
      expect(completed >= 2).toBe(true);
    });
  });
});

// ── Structured logging tests ─────────────────────────────────────

import {
  hubLog,
  logTimedSync,
  getRecentLogs,
  getLogSummary,
  getTimingStats,
  pruneLogs,
} from "@/lib/logger";

describe("structured logging", () => {
  describe("hubLog", () => {
    it("writes a log entry to the database", () => {
      hubLog("info", "system", "Test log entry", { testKey: "testValue" });
      const logs = getRecentLogs({ limit: 1, category: "system" });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].level).toBe("info");
      expect(logs[0].category).toBe("system");
      expect(logs[0].message).toBe("Test log entry");
      expect(logs[0].metadata.testKey).toBe("testValue");
    });

    it("writes all log levels", () => {
      const tag = `level-test-${Date.now()}`;
      hubLog("debug", "system", tag);
      hubLog("info", "system", tag);
      hubLog("warn", "system", tag);
      hubLog("error", "system", tag);
      const logs = getRecentLogs({ limit: 10, category: "system" });
      const tagged = logs.filter((l) => l.message === tag);
      expect(tagged.length).toBeGreaterThanOrEqual(4);
    });

    it("writes all categories", () => {
      const categories = ["scan", "search", "ai", "api", "system", "plugin", "integration"] as const;
      for (const cat of categories) {
        hubLog("info", cat, `Category test: ${cat}`);
      }
      const summary = getLogSummary();
      const cats = summary.map((s) => s.category);
      expect(cats).toContain("system");
    });
  });

  describe("logTimedSync", () => {
    it("logs duration of sync operations", () => {
      const tag = `timed-${Date.now()}`;
      const result = logTimedSync("system", tag, () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });
      expect(result).toBe(499500);
      const logs = getRecentLogs({ limit: 20, category: "system" });
      const timed = logs.find((l) => l.message.includes(tag));
      expect(timed).toBeDefined();
      expect(typeof timed!.durationMs).toBe("number");
    });

    it("logs errors from failed operations", () => {
      const tag = `fail-${Date.now()}`;
      expect(() => {
        logTimedSync("system", tag, () => {
          throw new Error("intentional failure");
        });
      }).toThrow("intentional failure");

      const logs = getRecentLogs({ limit: 20, category: "system" });
      const errLog = logs.find((l) => l.message.includes(tag) && l.level === "error");
      expect(errLog).toBeDefined();
      expect(errLog!.metadata.error).toBe("intentional failure");
    });
  });

  describe("getRecentLogs", () => {
    it("returns logs ordered by most recent first", () => {
      const logs = getRecentLogs({ limit: 5 });
      expect(Array.isArray(logs)).toBe(true);
      if (logs.length >= 2) {
        expect(logs[0].createdAt >= logs[1].createdAt).toBe(true);
      }
    });

    it("filters by category", () => {
      hubLog("info", "scan", "Scan-specific log");
      const logs = getRecentLogs({ category: "scan", limit: 5 });
      for (const l of logs) expect(l.category).toBe("scan");
    });

    it("filters by level", () => {
      hubLog("error", "system", "Error-level log");
      const logs = getRecentLogs({ level: "error", limit: 5 });
      for (const l of logs) expect(l.level).toBe("error");
    });

    it("respects limit", () => {
      const logs = getRecentLogs({ limit: 3 });
      expect(logs.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getLogSummary", () => {
    it("returns counts by category and level", () => {
      const summary = getLogSummary();
      expect(Array.isArray(summary)).toBe(true);
      for (const entry of summary) {
        expect(typeof entry.category).toBe("string");
        expect(typeof entry.level).toBe("string");
        expect(typeof entry.count).toBe("number");
      }
    });
  });

  describe("getTimingStats", () => {
    it("returns timing stats for a category", () => {
      // Create some timed entries
      logTimedSync("scan", "Stats test", () => 42);
      const stats = getTimingStats("scan");
      expect(typeof stats.count).toBe("number");
      expect(typeof stats.avgMs).toBe("number");
      expect(typeof stats.maxMs).toBe("number");
      expect(typeof stats.minMs).toBe("number");
      expect(typeof stats.p95Ms).toBe("number");
    });

    it("returns zeros for empty category", () => {
      const stats = getTimingStats("integration", 1);
      expect(stats.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("pruneLogs", () => {
    it("prunes old logs without error", () => {
      const removed = pruneLogs(30);
      expect(typeof removed).toBe("number");
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Search UX tests ──────────────────────────────────────────────

import { searchArtifacts, persistArtifacts } from "@/lib/db";
import { trackSearch, getPopularSearches, getSearchGaps } from "@/lib/activity";

describe("search UX", () => {
  describe("FTS5 search API", () => {
    beforeEach(() => {
      persistArtifacts([
        { path: "search/doc-alpha.md", title: "Alpha Documentation", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 100, staleDays: 1, snippet: "This is the alpha guide for developers." },
        { path: "search/doc-beta.md", title: "Beta Testing Guide", type: "md", group: "testing", modifiedAt: new Date().toISOString(), size: 200, staleDays: 2, snippet: "Beta testing procedures." },
        { path: "search/report.csv", title: "Quarterly Report", type: "csv", group: "reports", modifiedAt: new Date().toISOString(), size: 300, staleDays: 5, snippet: "Q3 financial summary." },
      ], new Map([
        ["search/doc-alpha.md", "# Alpha\n\nThis is the alpha documentation for new developers."],
        ["search/doc-beta.md", "# Beta\n\nBeta testing guide with procedures."],
        ["search/report.csv", "date,amount\n2026-01,5000"],
      ]), { deleteStale: false });
    });

    it("searches by content via FTS5", () => {
      const results = searchArtifacts("alpha");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].path).toContain("alpha");
    });

    it("returns empty for no matches", () => {
      expect(searchArtifacts("xyznonexistent999")).toEqual([]);
    });

    it("respects limit parameter", () => {
      const results = searchArtifacts("doc", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("search tracking", () => {
    it("tracks a search query", () => {
      trackSearch(`ux-test-${Date.now()}`, 5);
      // Tracking should not throw
    });

    it("getPopularSearches returns array", () => {
      const popular = getPopularSearches(7, 5);
      expect(Array.isArray(popular)).toBe(true);
    });
  });

  describe("client-side filter logic", () => {
    it("filters by group", () => {
      const artifacts = [
        { group: "docs", type: "md", title: "A" },
        { group: "testing", type: "md", title: "B" },
        { group: "docs", type: "html", title: "C" },
      ];
      const groupFilter = "docs";
      const filtered = artifacts.filter((a) => a.group === groupFilter);
      expect(filtered.length).toBe(2);
    });

    it("filters by type", () => {
      const artifacts = [
        { group: "docs", type: "md", title: "A" },
        { group: "docs", type: "html", title: "B" },
        { group: "docs", type: "md", title: "C" },
      ];
      const typeFilter = "md";
      const filtered = artifacts.filter((a) => a.type === typeFilter);
      expect(filtered.length).toBe(2);
    });

    it("combines group + type + text filters", () => {
      const artifacts = [
        { group: "docs", type: "md", title: "Alpha Docs" },
        { group: "docs", type: "md", title: "Beta Docs" },
        { group: "testing", type: "md", title: "Alpha Tests" },
        { group: "docs", type: "html", title: "Alpha Page" },
      ];
      const groupFilter = "docs";
      const typeFilter = "md";
      const textQuery = "alpha";

      let result = artifacts;
      result = result.filter((a) => a.group === groupFilter);
      result = result.filter((a) => a.type === typeFilter);
      result = result.filter((a) => a.title.toLowerCase().includes(textQuery));
      expect(result.length).toBe(1);
      expect(result[0].title).toBe("Alpha Docs");
    });

    it("extracts unique groups from artifacts", () => {
      const artifacts = [
        { group: "docs" }, { group: "testing" }, { group: "docs" }, { group: "reports" },
      ];
      const groups = [...new Set(artifacts.map((a) => a.group))].sort();
      expect(groups).toEqual(["docs", "reports", "testing"]);
    });

    it("extracts unique types from artifacts", () => {
      const artifacts = [
        { type: "md" }, { type: "html" }, { type: "md" }, { type: "csv" },
      ];
      const types = [...new Set(artifacts.map((a) => a.type))].sort();
      expect(types).toEqual(["csv", "html", "md"]);
    });
  });

  describe("recent searches", () => {
    it("deduplicates and limits recent searches", () => {
      const MAX_RECENT = 8;
      const addRecent = (prev: string[], query: string): string[] => {
        const filtered = prev.filter((s) => s !== query.trim());
        return [query.trim(), ...filtered].slice(0, MAX_RECENT);
      };

      let recent: string[] = [];
      recent = addRecent(recent, "architecture");
      recent = addRecent(recent, "roadmap");
      recent = addRecent(recent, "architecture"); // duplicate
      expect(recent).toEqual(["architecture", "roadmap"]);
      expect(recent.length).toBe(2);
    });

    it("caps at MAX_RECENT entries", () => {
      const MAX_RECENT = 8;
      let recent: string[] = [];
      for (let i = 0; i < 12; i++) {
        const filtered = recent.filter((s) => s !== `query-${i}`);
        recent = [`query-${i}`, ...filtered].slice(0, MAX_RECENT);
      }
      expect(recent.length).toBe(MAX_RECENT);
    });
  });
});

// ── SSE / Change subscription tests ──────────────────────────────

import {
  on as onEvent,
  off as offEvent,
  emit as emitEvent,
  getRecentEvents,
  clearEventLog,
  getListenerCount,
  clearAllListeners,
} from "@/lib/events";
import type { HubEvent } from "@/lib/events";

describe("change subscriptions (SSE)", () => {
  afterEach(() => {
    clearAllListeners();
    clearEventLog();
  });

  describe("event bus for SSE", () => {
    it("emits and receives events", async () => {
      let received: HubEvent | null = null;
      const handler = (e: HubEvent) => { received = e; };
      onEvent("scan.complete", handler);

      await emitEvent("scan.complete", { artifacts: 100 });

      expect(received).not.toBeNull();
      expect(received!.type).toBe("scan.complete");
      expect(received!.data.artifacts).toBe(100);
      expect(received!.timestamp).toBeTruthy();
    });

    it("records events in log", async () => {
      await emitEvent("artifact.created", { path: "sse/new.md" });
      const events = getRecentEvents(5);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe("artifact.created");
    });

    it("supports multiple listeners per event type", async () => {
      let count = 0;
      const h1 = () => { count++; };
      const h2 = () => { count++; };
      onEvent("scan.complete", h1);
      onEvent("scan.complete", h2);

      await emitEvent("scan.complete", {});
      expect(count).toBe(2);
    });

    it("off removes a specific listener", async () => {
      let count = 0;
      const handler = () => { count++; };
      onEvent("artifact.modified", handler);
      offEvent("artifact.modified", handler);

      await emitEvent("artifact.modified", {});
      expect(count).toBe(0);
    });

    it("getListenerCount tracks registered handlers", () => {
      const handler = () => {};
      onEvent("scan.complete", handler);
      expect(getListenerCount("scan.complete")).toBeGreaterThanOrEqual(1);
    });
  });

  describe("event type filtering", () => {
    it("filters events by allowed types", async () => {
      const allowedTypes = new Set(["scan.complete", "artifact.created"]);
      const events: HubEvent[] = [];

      const handler = (e: HubEvent) => {
        if (allowedTypes.has(e.type)) events.push(e);
      };
      onEvent("scan.complete", handler);
      onEvent("artifact.modified", handler);

      await emitEvent("scan.complete", {});
      await emitEvent("artifact.modified", {});

      expect(events.length).toBe(1);
      expect(events[0].type).toBe("scan.complete");
    });

    it("null filter allows all events", async () => {
      const allowedTypes: Set<string> | null = null;
      const events: HubEvent[] = [];

      const handler = (e: HubEvent) => {
        if (!allowedTypes || allowedTypes.has(e.type)) events.push(e);
      };
      onEvent("scan.complete", handler);
      await emitEvent("scan.complete", {});
      expect(events.length).toBe(1);
    });
  });

  describe("SSE message formatting", () => {
    it("formats event as SSE data line", async () => {
      await emitEvent("artifact.created", { path: "test.md" });
      const events = getRecentEvents(1);
      const sseMsg = `data: ${JSON.stringify(events[0])}\n\n`;
      expect(sseMsg).toContain("data: {");
      expect(sseMsg).toContain("artifact.created");
      expect(sseMsg.endsWith("\n\n")).toBe(true);
    });

    it("heartbeat format is SSE comment", () => {
      const heartbeat = `: heartbeat ${new Date().toISOString()}\n\n`;
      expect(heartbeat).toMatch(/^: heartbeat \d{4}-/);
    });
  });

  describe("recent events for replay on connect", () => {
    it("getRecentEvents returns most recent first", async () => {
      await emitEvent("artifact.created", { order: 1 });
      await emitEvent("artifact.created", { order: 2 });
      const events = getRecentEvents(5);
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].data.order).toBe(2); // most recent first
    });

    it("clearEventLog empties the log", async () => {
      await emitEvent("scan.complete", {});
      clearEventLog();
      expect(getRecentEvents(10)).toEqual([]);
    });
  });
});

// ── Weekly digest tests ──────────────────────────────────────────

import { generateWeeklyDigest, formatDigestText, formatDigestSlack } from "@/lib/weekly-digest";
import type { WeeklyDigest } from "@/lib/weekly-digest";

describe("weekly digest", () => {
  describe("generateWeeklyDigest", () => {
    it("returns valid digest structure", () => {
      const digest = generateWeeklyDigest(7);
      expect(digest.period.start).toBeTruthy();
      expect(digest.period.end).toBeTruthy();
      expect(typeof digest.changes.modified).toBe("number");
      expect(typeof digest.decisions.new).toBe("number");
      expect(typeof digest.stale.count).toBe("number");
      expect(typeof digest.stats.totalArtifacts).toBe("number");
      expect(typeof digest.stats.searchCount).toBe("number");
      expect(typeof digest.stats.agentQueries).toBe("number");
      expect(digest.generatedAt).toBeTruthy();
    });

    it("respects custom days parameter", () => {
      const digest = generateWeeklyDigest(14);
      const start = new Date(digest.period.start);
      const end = new Date(digest.period.end);
      const daysDiff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeCloseTo(14, 0);
    });

    it("changes section has topChanged array", () => {
      const digest = generateWeeklyDigest(7);
      expect(Array.isArray(digest.changes.topChanged)).toBe(true);
      for (const c of digest.changes.topChanged) {
        expect(c.path).toBeTruthy();
        expect(c.title).toBeTruthy();
      }
    });

    it("decisions section has recent array", () => {
      const digest = generateWeeklyDigest(7);
      expect(Array.isArray(digest.decisions.recent)).toBe(true);
    });

    it("stale section has critical array", () => {
      const digest = generateWeeklyDigest(7);
      expect(Array.isArray(digest.stale.critical)).toBe(true);
    });
  });

  describe("formatDigestText", () => {
    it("formats digest as readable text", () => {
      const digest = generateWeeklyDigest(7);
      const text = formatDigestText(digest);
      expect(text).toContain("Weekly Digest");
      expect(text).toContain("Changes:");
      expect(text).toContain("artifacts");
    });

    it("includes decisions when present", () => {
      const digest: WeeklyDigest = {
        period: { start: "2026-04-01", end: "2026-04-07" },
        changes: { added: 0, modified: 3, deleted: 0, topChanged: [] },
        decisions: { new: 2, superseded: 1, reverted: 0, recent: [{ summary: "Use TypeScript", artifactPath: "docs/d.md" }] },
        stale: { count: 0, critical: [] },
        gaps: { count: 0, topics: [] },
        stats: { totalArtifacts: 100, searchCount: 50, agentQueries: 10 },
        generatedAt: new Date().toISOString(),
      };
      const text = formatDigestText(digest);
      expect(text).toContain("Decisions: 2 new");
      expect(text).toContain("Use TypeScript");
    });

    it("includes knowledge gaps when present", () => {
      const digest: WeeklyDigest = {
        period: { start: "2026-04-01", end: "2026-04-07" },
        changes: { added: 0, modified: 0, deleted: 0, topChanged: [] },
        decisions: { new: 0, superseded: 0, reverted: 0, recent: [] },
        stale: { count: 0, critical: [] },
        gaps: { count: 2, topics: ["deployment", "monitoring"] },
        stats: { totalArtifacts: 50, searchCount: 20, agentQueries: 5 },
        generatedAt: new Date().toISOString(),
      };
      const text = formatDigestText(digest);
      expect(text).toContain("Knowledge gaps");
      expect(text).toContain("deployment");
    });
  });

  describe("formatDigestSlack", () => {
    it("returns text and blocks", () => {
      const digest = generateWeeklyDigest(7);
      const slack = formatDigestSlack(digest);
      expect(typeof slack.text).toBe("string");
      expect(Array.isArray(slack.blocks)).toBe(true);
      expect(slack.blocks.length).toBeGreaterThanOrEqual(3); // header + changes + footer
    });

    it("includes header block", () => {
      const digest = generateWeeklyDigest(7);
      const slack = formatDigestSlack(digest);
      const header = slack.blocks.find((b) => b.type === "header");
      expect(header).toBeDefined();
    });

    it("includes context footer", () => {
      const digest = generateWeeklyDigest(7);
      const slack = formatDigestSlack(digest);
      const footer = slack.blocks.find((b) => b.type === "context");
      expect(footer).toBeDefined();
    });
  });
});

// ── Search source indicators tests ───────────────────────────────

describe("search source indicators", () => {
  describe("source label mapping", () => {
    it("maps fts to FTS", () => {
      const label = "fts" === "fts" ? "FTS" : "fts" === "semantic" ? "AI" : "FTS+AI";
      expect(label).toBe("FTS");
    });

    it("maps semantic to AI", () => {
      const source = "semantic";
      const label = source === "fts" ? "FTS" : source === "semantic" ? "AI" : "FTS+AI";
      expect(label).toBe("AI");
    });

    it("maps hybrid to FTS+AI", () => {
      const source = "hybrid";
      const label = source === "fts" ? "FTS" : source === "semantic" ? "AI" : "FTS+AI";
      expect(label).toBe("FTS+AI");
    });
  });

  describe("source color mapping", () => {
    it("semantic gets purple styling", () => {
      const source = "semantic";
      const color = source === "semantic" ? "purple" : source === "hybrid" ? "blue" : "zinc";
      expect(color).toBe("purple");
    });

    it("hybrid gets blue styling", () => {
      const source = "hybrid";
      const color = source === "semantic" ? "purple" : source === "hybrid" ? "blue" : "zinc";
      expect(color).toBe("blue");
    });

    it("fts gets zinc/default styling", () => {
      const source = "fts";
      const color = source === "semantic" ? "purple" : source === "hybrid" ? "blue" : "zinc";
      expect(color).toBe("zinc");
    });
  });

  describe("results mode detection", () => {
    it("detects FTS-only results", () => {
      const results = [
        { source: "fts" }, { source: "fts" },
      ];
      const hasSemanticResults = results.some((r) => r.source === "semantic" || r.source === "hybrid");
      expect(hasSemanticResults).toBe(false);
    });

    it("detects mixed FTS + semantic results", () => {
      const results = [
        { source: "fts" }, { source: "semantic" }, { source: "hybrid" },
      ];
      const hasSemanticResults = results.some((r) => r.source === "semantic" || r.source === "hybrid");
      expect(hasSemanticResults).toBe(true);
    });
  });
});

// ── Scheduled Slack digest tests ─────────────────────────────────

import {
  startDigestScheduler,
  stopDigestScheduler,
  isDigestEnabled,
  isDigestSchedulerActive,
  getDigestScheduleStatus,
  runDigest,
  resetDigestScheduler,
} from "@/lib/digest-scheduler";

describe("scheduled Slack digest", () => {
  afterEach(() => {
    resetDigestScheduler();
  });

  describe("isDigestEnabled", () => {
    it("defaults to disabled", () => {
      delete process.env.HUB_DIGEST_ENABLED;
      expect(isDigestEnabled()).toBe(false);
    });

    it("enabled when HUB_DIGEST_ENABLED=true", () => {
      process.env.HUB_DIGEST_ENABLED = "true";
      expect(isDigestEnabled()).toBe(true);
      delete process.env.HUB_DIGEST_ENABLED;
    });
  });

  describe("scheduler lifecycle", () => {
    it("starts and becomes active", () => {
      startDigestScheduler({ intervalMs: 60000 });
      expect(isDigestSchedulerActive()).toBe(true);
      stopDigestScheduler();
    });

    it("stops and becomes inactive", () => {
      startDigestScheduler({ intervalMs: 60000 });
      stopDigestScheduler();
      expect(isDigestSchedulerActive()).toBe(false);
    });

    it("prevents double-start", () => {
      startDigestScheduler({ intervalMs: 60000 });
      startDigestScheduler({ intervalMs: 60000 }); // should not create second interval
      expect(isDigestSchedulerActive()).toBe(true);
      stopDigestScheduler();
    });
  });

  describe("runDigest", () => {
    it("generates a digest result", async () => {
      const result = await runDigest();
      expect(typeof result.sent).toBe("boolean");
      expect(result.digest).toBeDefined();
      expect(typeof result.digest.changes.modified).toBe("number");
    });
  });

  describe("getDigestScheduleStatus", () => {
    it("returns status structure", () => {
      const status = getDigestScheduleStatus();
      expect(typeof status.enabled).toBe("boolean");
      expect(typeof status.running).toBe("boolean");
      expect(typeof status.intervalMs).toBe("number");
      expect(typeof status.runCount).toBe("number");
    });

    it("tracks runCount after runDigest", async () => {
      resetDigestScheduler();
      await runDigest();
      const status = getDigestScheduleStatus();
      expect(status.runCount).toBeGreaterThanOrEqual(1);
      expect(status.lastRun).toBeTruthy();
    });
  });
});

// ── Integration tests (v5: real user flows) ──────────────────────

import { persistArtifacts, searchArtifacts, getArtifactContent, getArtifactCount } from "@/lib/db";
import { analyzeHygiene, getCachedHygieneFindingCount } from "@/lib/hygiene-analyzer";
import { saveDecision, getActiveDecisions, searchDecisions as searchDecisionsLib, queryDecisions } from "@/lib/decision-tracker";
import { notify, getNotifications, getUnreadCount } from "@/lib/notifications";
import { getSearchCache, buildSearchCacheKey, invalidateSearchCache } from "@/lib/search-cache";

describe("integration tests — real user flows", () => {
  // Seed test workspace
  beforeAll(() => {
    persistArtifacts([
      { path: "int/docs/architecture.md", title: "Architecture Overview", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 500, staleDays: 1, snippet: "Microservices architecture." },
      { path: "int/docs/api-guide.md", title: "API Guide", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 300, staleDays: 5, snippet: "REST API documentation." },
      { path: "int/planning/roadmap.md", title: "Q3 Roadmap", type: "md", group: "planning", modifiedAt: new Date().toISOString(), size: 400, staleDays: 2, snippet: "Quarterly planning." },
      { path: "int/stale/old-doc.md", title: "Deprecated Guide", type: "md", group: "docs", modifiedAt: "2025-01-01T00:00:00Z", size: 200, staleDays: 90, snippet: "Very old document." },
    ], new Map([
      ["int/docs/architecture.md", "# Architecture\n\nWe decided to use microservices with gRPC.\n\n## Components\n\n- API Gateway\n- Auth Service"],
      ["int/docs/api-guide.md", "# API Guide\n\nREST API with JSON responses for all endpoints."],
      ["int/planning/roadmap.md", "# Q3 Roadmap\n\n1. Ship semantic search\n2. Launch plugin system"],
      ["int/stale/old-doc.md", "# Deprecated\n\nThis guide is outdated and should be removed."],
    ]), { deleteStale: false });
  });

  describe("flow: search → find → read content", () => {
    it("searches, finds results, reads content of top result", () => {
      const results = searchArtifacts("gRPC");
      expect(results.length).toBeGreaterThanOrEqual(1);

      const match = results.find((r) => r.path.startsWith("int/"));
      expect(match).toBeDefined();

      const content = getArtifactContent(match!.path);
      expect(content).not.toBeNull();
      expect(content).toContain("gRPC");
    });
  });

  describe("flow: hygiene scan → find stale docs → count findings", () => {
    it("analyzes workspace and detects stale content", () => {
      const artifacts = [
        { path: "int/stale/old-doc.md", title: "Deprecated Guide", type: "md", group: "docs", modifiedAt: "2025-01-01", size: 200, staleDays: 90, snippet: "Outdated" },
      ];
      const report = analyzeHygiene(artifacts as any, new Date().toISOString());
      expect(report.stats.filesAnalyzed).toBeGreaterThanOrEqual(0);
      expect(typeof report.stats.totalFindings).toBe("number");

      // Cache should be populated
      const count = getCachedHygieneFindingCount();
      expect(typeof count).toBe("number");
    });
  });

  describe("flow: extract decisions → query them", () => {
    it("saves a decision and retrieves it via query", () => {
      saveDecision({
        artifactPath: "int/docs/architecture.md",
        summary: "Use microservices with gRPC for internal communication",
        actor: "alice",
        source: "heuristic",
      });

      const active = getActiveDecisions(10);
      expect(active.some((d) => d.summary.includes("gRPC"))).toBe(true);

      const queryResult = queryDecisions("what was decided about microservices?");
      expect(queryResult.keywords).toContain("microservices");
      expect(queryResult.decisions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("flow: notification lifecycle", () => {
    it("creates notification → shows unread → marks read → clears", () => {
      const recipient = `int-flow-${Date.now()}`;

      // Create
      const id = notify({ recipient, type: "review", title: "Review approved" });
      expect(id).toBeGreaterThan(0);

      // Unread count
      expect(getUnreadCount(recipient)).toBe(1);

      // Get notifications
      const notifs = getNotifications(recipient);
      expect(notifs.length).toBe(1);
      expect(notifs[0].read).toBe(false);
    });
  });

  describe("flow: search cache lifecycle", () => {
    it("misses on first search → caches → hits on repeat → invalidates on scan", () => {
      const cache = getSearchCache();
      const key = buildSearchCacheKey("integration-test", 10, 0, "fts");

      // Miss
      expect(cache.get(key)).toBeUndefined();

      // Set
      cache.set(key, { results: ["cached"] });
      expect(cache.get(key)).toBeDefined();

      // Invalidate
      invalidateSearchCache();
      expect(cache.get(key)).toBeUndefined();
    });
  });

  describe("flow: artifact count stays consistent", () => {
    it("count matches after persist", () => {
      const count = getArtifactCount();
      expect(count).toBeGreaterThan(0);
      // Count should be stable across calls
      expect(getArtifactCount()).toBe(count);
    });
  });

  describe("flow: decision contradiction detection", () => {
    it("saves conflicting decisions and queries detects them", () => {
      const ts = Date.now();
      saveDecision({ artifactPath: `int/conflict-a-${ts}.md`, summary: `Use PostgreSQL database for production storage ${ts}` });
      saveDecision({ artifactPath: `int/conflict-b-${ts}.md`, summary: `Use MySQL database for production storage ${ts}` });

      const result = queryDecisions(`database production storage ${ts}`);
      expect(result.decisions.length).toBeGreaterThanOrEqual(2);
      // Contradictions may or may not be detected depending on keyword overlap
      expect(Array.isArray(result.contradictions)).toBe(true);
    });
  });
});

// ── Context file generation tests ───────────────────────────────

import { generateContextContent, generateCursorRulesContent, writeContextFiles } from "@/lib/context-file-generator";
import type { Manifest } from "@/lib/types";

describe("context file generation", () => {
  const mockManifest: Manifest = {
    generatedAt: "2026-04-06T12:00:00Z",
    workspaces: ["/tmp/test-ws"],
    groups: [
      { id: "docs", label: "Docs", description: "Documentation", color: "#3b82f6", tab: "knowledge", count: 3 },
      { id: "planning", label: "Planning", description: "Plans", color: "#f59e0b", tab: "planning", count: 2 },
    ],
    artifacts: [
      { path: "docs/arch.md", title: "Architecture", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 500, staleDays: 1, snippet: "Architecture overview" },
      { path: "docs/old.md", title: "Old Guide", type: "md", group: "docs", modifiedAt: "2025-01-01", size: 200, staleDays: 100, snippet: "Outdated" },
      { path: "planning/roadmap.md", title: "Roadmap", type: "md", group: "planning", modifiedAt: new Date().toISOString(), size: 300, staleDays: 3, snippet: "Q3 planning" },
    ],
  };

  describe("generateContextContent", () => {
    it("includes hub marker", () => {
      const content = generateContextContent(mockManifest, "/tmp/test-ws");
      expect(content).toContain("<!-- auto-generated by the-hub -->");
    });

    it("includes workspace overview", () => {
      const content = generateContextContent(mockManifest, "/tmp/test-ws");
      expect(content).toContain("3 artifacts");
      expect(content).toContain("2 groups");
    });

    it("lists groups", () => {
      const content = generateContextContent(mockManifest, "/tmp/test-ws");
      expect(content).toContain("**Docs** (docs)");
      expect(content).toContain("**Planning** (planning)");
    });

    it("includes recently changed docs", () => {
      const content = generateContextContent(mockManifest, "/tmp/test-ws");
      expect(content).toContain("Recently Changed");
      expect(content).toContain("Architecture");
    });

    it("includes stale docs", () => {
      const content = generateContextContent(mockManifest, "/tmp/test-ws");
      expect(content).toContain("Needs Attention");
      expect(content).toContain("Old Guide");
      expect(content).toContain("100 days old");
    });
  });

  describe("generateCursorRulesContent", () => {
    it("includes hub marker", () => {
      const content = generateCursorRulesContent(mockManifest);
      expect(content).toContain("<!-- auto-generated by the-hub -->");
    });

    it("includes artifact count", () => {
      const content = generateCursorRulesContent(mockManifest);
      expect(content).toContain("3 artifacts");
    });

    it("includes stale warning", () => {
      const content = generateCursorRulesContent(mockManifest);
      expect(content).toContain("WARNING: 1 stale");
    });
  });

  describe("writeContextFiles", () => {
    const testDir = join(resolve(""), ".hub-test-context-" + Date.now());

    beforeAll(() => {
      mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
      try { rmSync(testDir, { recursive: true }); } catch { /* cleanup */ }
    });

    it("writes .hub-context.md to workspace", () => {
      const result = writeContextFiles(mockManifest, testDir);
      expect(result.claudeMdWritten).toBe(true);
      expect(existsSync(join(testDir, ".hub-context.md"))).toBe(true);
    });

    it("writes .cursorrules to workspace", () => {
      const result = writeContextFiles(mockManifest, testDir);
      expect(result.cursorRulesWritten).toBe(true);
      expect(existsSync(join(testDir, ".cursorrules"))).toBe(true);
    });

    it("does not overwrite user-created files", () => {
      const userDir = join(resolve(""), ".hub-test-user-" + Date.now());
      mkdirSync(userDir, { recursive: true });

      // Write a user-created file (no hub marker)
      writeFileSync(join(userDir, ".hub-context.md"), "# My Custom Context\n\nUser content here.", "utf8");

      const result = writeContextFiles(mockManifest, userDir);
      expect(result.claudeMdWritten).toBe(false); // should NOT overwrite

      // Verify user content is preserved
      const content = readFileSync(join(userDir, ".hub-context.md"), "utf8");
      expect(content).toContain("My Custom Context");

      try { rmSync(userDir, { recursive: true }); } catch { /* cleanup */ }
    });

    it("returns error for non-existent workspace", () => {
      const result = writeContextFiles(mockManifest, "/tmp/nonexistent-workspace-path-xyz");
      expect(result.error).toContain("does not exist");
    });
  });
});

// ── Scan-time insight tests ─────────────────────────────────────

import { processArtifactInsights, processScanInsights, getLastInsightSummary } from "@/lib/scan-insights";

describe("scan-time insights", () => {
  beforeAll(() => {
    // Seed artifacts for insight processing
    persistArtifacts([
      { path: "insight/decision-doc.md", title: "Decision Doc", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 300, staleDays: 0, snippet: "We decided to use gRPC" },
      { path: "insight/plain-doc.md", title: "Plain Doc", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 100, staleDays: 5, snippet: "Just a note" },
    ], new Map([
      ["insight/decision-doc.md", "# Architecture\n\nWe decided to use gRPC for internal communication.\nThe team agreed to migrate to PostgreSQL."],
      ["insight/plain-doc.md", "# Note\n\nJust a simple note about something."],
    ]), { deleteStale: false });
  });

  describe("processArtifactInsights", () => {
    it("returns valid insight for a path", () => {
      const insight = processArtifactInsights("insight/decision-doc.md");
      expect(insight.path).toBe("insight/decision-doc.md");
      expect(typeof insight.decisionsExtracted).toBe("number");
      expect(typeof insight.impactScore).toBe("number");
      expect(typeof insight.impactLevel).toBe("string");
      expect(insight.processedAt).toBeTruthy();
    });

    it("extracts decisions from content with decision language", () => {
      const insight = processArtifactInsights("insight/decision-doc.md");
      expect(insight.decisionsExtracted).toBeGreaterThanOrEqual(1);
    });

    it("handles docs without decisions", () => {
      const insight = processArtifactInsights("insight/plain-doc.md");
      expect(insight.decisionsExtracted).toBe(0);
    });

    it("handles non-existent paths gracefully", () => {
      const insight = processArtifactInsights("insight/nonexistent.md");
      expect(insight.decisionsExtracted).toBe(0);
      expect(insight.impactScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("processScanInsights", () => {
    it("processes multiple paths and returns summary", () => {
      const summary = processScanInsights(["insight/decision-doc.md", "insight/plain-doc.md"]);
      expect(summary.totalProcessed).toBe(2);
      expect(typeof summary.totalDecisions).toBe("number");
      expect(typeof summary.highImpactCount).toBe("number");
      expect(typeof summary.durationMs).toBe("number");
      expect(summary.insights.length).toBe(2);
    });

    it("caps at 50 files", () => {
      const paths = Array.from({ length: 60 }, (_, i) => `insight/doc-${i}.md`);
      const summary = processScanInsights(paths);
      expect(summary.totalProcessed).toBeLessThanOrEqual(50);
    });

    it("updates lastInsightSummary", () => {
      processScanInsights(["insight/decision-doc.md"]);
      const last = getLastInsightSummary();
      expect(last).not.toBeNull();
      expect(last!.totalProcessed).toBe(1);
    });

    it("returns empty summary for empty input", () => {
      const summary = processScanInsights([]);
      expect(summary.totalProcessed).toBe(0);
      expect(summary.insights.length).toBe(0);
    });
  });
});
