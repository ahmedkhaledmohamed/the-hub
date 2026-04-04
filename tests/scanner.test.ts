import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
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
