import { describe, it, expect } from "vitest";
import type {
  ChartPanelConfig,
  ChecklistPanelConfig,
  CustomPanelConfig,
  PanelConfig,
} from "@/lib/types";

/**
 * Tests for the new panel type configurations.
 *
 * Since the panel components are React client components that require
 * a browser/DOM environment, we test the type system and config
 * validation. Component rendering is verified via the build (Next.js
 * TypeScript checks) and manual testing.
 */

describe("panel types", () => {
  describe("ChartPanelConfig", () => {
    it("accepts valid chart config", () => {
      const config: ChartPanelConfig = {
        type: "chart",
        title: "Weekly Metrics",
        series: [
          { label: "Artifacts", data: [10, 12, 15, 14, 18, 20, 22], color: "#3b82f6" },
          { label: "Stale", data: [5, 4, 6, 3, 2, 3, 1], color: "#ef4444" },
        ],
      };

      expect(config.type).toBe("chart");
      expect(config.series.length).toBe(2);
      expect(config.series[0].data.length).toBe(7);
    });

    it("accepts chart config with badge and height", () => {
      const config: ChartPanelConfig = {
        type: "chart",
        title: "Trends",
        badge: { text: "Live", color: "green" },
        series: [{ label: "Count", data: [1, 2, 3] }],
        height: 50,
      };

      expect(config.badge?.text).toBe("Live");
      expect(config.height).toBe(50);
    });

    it("supports series without explicit color", () => {
      const config: ChartPanelConfig = {
        type: "chart",
        title: "Simple",
        series: [{ label: "Values", data: [100, 200, 150] }],
      };

      expect(config.series[0].color).toBeUndefined();
    });

    it("is assignable to PanelConfig", () => {
      const config: PanelConfig = {
        type: "chart",
        title: "Test",
        series: [{ label: "A", data: [1, 2] }],
      };

      expect(config.type).toBe("chart");
    });
  });

  describe("ChecklistPanelConfig", () => {
    it("accepts valid checklist config", () => {
      const config: ChecklistPanelConfig = {
        type: "checklist",
        title: "Sprint Ceremony",
        items: [
          { id: "standup", label: "Daily standup" },
          { id: "retro", label: "Sprint retro", description: "End of sprint" },
          { id: "planning", label: "Sprint planning" },
        ],
      };

      expect(config.type).toBe("checklist");
      expect(config.items.length).toBe(3);
      expect(config.items[1].description).toBe("End of sprint");
    });

    it("accepts persistKey for localStorage isolation", () => {
      const config: ChecklistPanelConfig = {
        type: "checklist",
        title: "Launch Checklist",
        persistKey: "launch-v2",
        items: [
          { id: "tests", label: "All tests passing" },
          { id: "docs", label: "Docs updated" },
        ],
      };

      expect(config.persistKey).toBe("launch-v2");
    });

    it("accepts badge", () => {
      const config: ChecklistPanelConfig = {
        type: "checklist",
        title: "Weekly",
        badge: { text: "3/5", color: "orange" },
        items: [{ id: "a", label: "Task A" }],
      };

      expect(config.badge?.text).toBe("3/5");
    });

    it("is assignable to PanelConfig", () => {
      const config: PanelConfig = {
        type: "checklist",
        title: "Test",
        items: [{ id: "x", label: "X" }],
      };

      expect(config.type).toBe("checklist");
    });
  });

  describe("CustomPanelConfig", () => {
    it("accepts URL-based custom panel", () => {
      const config: CustomPanelConfig = {
        type: "custom",
        title: "External Widget",
        url: "https://example.com/widget",
        height: 300,
      };

      expect(config.type).toBe("custom");
      expect(config.url).toBe("https://example.com/widget");
    });

    it("accepts markdown-based custom panel", () => {
      const config: CustomPanelConfig = {
        type: "custom",
        title: "Quick Reference",
        markdown: "## Shortcuts\n\n- `Cmd+K` — Search\n- `Cmd+.` — Notes\n- `?` — Help",
      };

      expect(config.markdown).toContain("Cmd+K");
    });

    it("accepts badge", () => {
      const config: CustomPanelConfig = {
        type: "custom",
        title: "Info",
        badge: { text: "New", color: "blue" },
        markdown: "Hello world",
      };

      expect(config.badge?.text).toBe("New");
    });

    it("is assignable to PanelConfig", () => {
      const config: PanelConfig = {
        type: "custom",
        title: "Test",
        markdown: "# Hello",
      };

      expect(config.type).toBe("custom");
    });
  });

  describe("PanelConfig union", () => {
    it("includes all 10 panel types", () => {
      const configs: PanelConfig[] = [
        { type: "timeline", title: "T", items: [] },
        { type: "links", title: "L", items: [] },
        { type: "tools", title: "T", items: [] },
        { type: "url", title: "U", url: "https://example.com" },
        { type: "markdown", title: "M", file: "readme.md" },
        { type: "embed", title: "E", url: "https://example.com" },
        { type: "health", title: "H" },
        { type: "chart", title: "C", series: [] },
        { type: "checklist", title: "CL", items: [] },
        { type: "custom", title: "CU" },
      ];

      const types = configs.map((c) => c.type);
      expect(types).toEqual([
        "timeline", "links", "tools", "url", "markdown",
        "embed", "health", "chart", "checklist", "custom",
      ]);
    });
  });
});

// ── Plugin system tests ────────────────────────────────────────────

import type { HubPlugin, Artifact, Manifest } from "@/lib/types";
import {
  registerPlugin,
  unregisterPlugin,
  getLoadedPlugins,
  getPluginCount,
  runOnScan,
  runOnSearch,
  runOnRender,
} from "@/lib/plugin-registry";

describe("plugin system", () => {
  const testPlugin: HubPlugin = {
    name: "test-plugin",
    version: "1.0.0",
    description: "Test plugin for unit tests",

    onScan: () => [{
      path: "plugin:test/virtual",
      title: "Virtual Artifact",
      type: "md",
      group: "other",
      modifiedAt: new Date().toISOString(),
      size: 0,
      staleDays: 0,
    }],

    onSearch: (query) => {
      if (query.includes("test")) {
        return [{
          path: "plugin:test/search-result",
          title: "Plugin Search Result",
          type: "md",
          group: "other",
          modifiedAt: new Date().toISOString(),
          size: 0,
          staleDays: 0,
        }];
      }
      return [];
    },

    onRender: () => [{
      type: "custom" as const,
      title: "Test Plugin Panel",
      markdown: "# Hello from test plugin",
    }],
  };

  afterEach(() => {
    unregisterPlugin("test-plugin");
  });

  describe("registerPlugin", () => {
    it("registers and retrieves a plugin", () => {
      registerPlugin(testPlugin);
      expect(getPluginCount()).toBeGreaterThanOrEqual(1);
      const loaded = getLoadedPlugins();
      expect(loaded.some((p) => p.name === "test-plugin")).toBe(true);
    });
  });

  describe("unregisterPlugin", () => {
    it("removes a plugin", () => {
      registerPlugin(testPlugin);
      const before = getPluginCount();
      unregisterPlugin("test-plugin");
      expect(getPluginCount()).toBe(before - 1);
    });
  });

  describe("runOnScan", () => {
    it("collects virtual artifacts from plugins", async () => {
      registerPlugin(testPlugin);
      const manifest: Manifest = {
        generatedAt: new Date().toISOString(),
        workspaces: [],
        groups: [],
        artifacts: [],
      };
      const artifacts = await runOnScan(manifest);
      expect(artifacts.length).toBeGreaterThanOrEqual(1);
      expect(artifacts[0].path).toBe("plugin:test/virtual");
    });
  });

  describe("runOnSearch", () => {
    it("extends search results for matching queries", async () => {
      registerPlugin(testPlugin);
      const results = await runOnSearch("test query", []);
      expect(results.some((r) => r.path === "plugin:test/search-result")).toBe(true);
    });

    it("returns empty for non-matching queries", async () => {
      registerPlugin(testPlugin);
      const results = await runOnSearch("nothing", []);
      expect(results.length).toBe(0);
    });
  });

  describe("runOnRender", () => {
    it("collects panel configs from plugins", async () => {
      registerPlugin(testPlugin);
      const panels = await runOnRender();
      expect(panels.length).toBeGreaterThanOrEqual(1);
      expect(panels.some((p) => p.title === "Test Plugin Panel")).toBe(true);
    });
  });

  describe("HubPlugin interface", () => {
    it("accepts minimal plugin (name + version only)", () => {
      const minimal: HubPlugin = { name: "minimal", version: "0.1.0" };
      registerPlugin(minimal);
      expect(getLoadedPlugins().some((p) => p.name === "minimal")).toBe(true);
      unregisterPlugin("minimal");
    });

    it("accepts plugin with all hooks", () => {
      const full: HubPlugin = {
        name: "full",
        version: "1.0.0",
        description: "Full plugin",
        onInit: () => {},
        onScan: () => [],
        onSearch: () => [],
        onRender: () => [],
        onDestroy: () => {},
      };
      registerPlugin(full);
      expect(getLoadedPlugins().some((p) => p.name === "full")).toBe(true);
      unregisterPlugin("full");
    });
  });
});

// ── GitHub plugin tests ────────────────────────────────────────────

import { getToken, extractGitHubRepos, getCached, setCache, cache } from "../plugins/github/index";

describe("GitHub plugin", () => {
  afterEach(() => {
    cache.clear();
  });

  describe("getToken", () => {
    it("returns null when GITHUB_TOKEN not set", () => {
      const orig = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      expect(getToken()).toBeNull();
      if (orig) process.env.GITHUB_TOKEN = orig;
    });

    it("returns token when set", () => {
      const orig = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = "test-token-123";
      expect(getToken()).toBe("test-token-123");
      if (orig) process.env.GITHUB_TOKEN = orig;
      else delete process.env.GITHUB_TOKEN;
    });
  });

  describe("extractGitHubRepos", () => {
    it("extracts repos from GITHUB_REPOS env", () => {
      const orig = process.env.GITHUB_REPOS;
      process.env.GITHUB_REPOS = "owner/repo1, owner/repo2";
      const repos = extractGitHubRepos({
        generatedAt: "", workspaces: [], groups: [], artifacts: [],
      });
      expect(repos).toEqual([
        { owner: "owner", repo: "repo1" },
        { owner: "owner", repo: "repo2" },
      ]);
      if (orig) process.env.GITHUB_REPOS = orig;
      else delete process.env.GITHUB_REPOS;
    });

    it("returns empty when GITHUB_REPOS not set", () => {
      const orig = process.env.GITHUB_REPOS;
      delete process.env.GITHUB_REPOS;
      const repos = extractGitHubRepos({
        generatedAt: "", workspaces: [], groups: [], artifacts: [],
      });
      expect(repos).toEqual([]);
      if (orig) process.env.GITHUB_REPOS = orig;
    });

    it("deduplicates repos", () => {
      const orig = process.env.GITHUB_REPOS;
      process.env.GITHUB_REPOS = "a/b, a/b, a/b";
      const repos = extractGitHubRepos({
        generatedAt: "", workspaces: [], groups: [], artifacts: [],
      });
      expect(repos).toEqual([{ owner: "a", repo: "b" }]);
      if (orig) process.env.GITHUB_REPOS = orig;
      else delete process.env.GITHUB_REPOS;
    });
  });

  describe("cache", () => {
    it("stores and retrieves cached data", () => {
      setCache("test-key", { value: 42 });
      expect(getCached<{ value: number }>("test-key")).toEqual({ value: 42 });
    });

    it("returns null for expired cache", () => {
      cache.set("expired", { data: "old", expiresAt: Date.now() - 1000 });
      expect(getCached("expired")).toBeNull();
    });

    it("returns null for missing keys", () => {
      expect(getCached("nonexistent")).toBeNull();
    });
  });
});
