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

// ── Marketplace tests ──────────────────────────────────────────────

import {
  getMarketplacePlugins,
  searchMarketplace,
  getInstalledPlugins,
  isPluginInstalled,
  installPlugin,
  uninstallPlugin,
} from "@/lib/marketplace";

describe("plugin marketplace", () => {
  describe("getMarketplacePlugins", () => {
    it("returns builtin plugins", () => {
      const plugins = getMarketplacePlugins();
      expect(plugins.length).toBeGreaterThanOrEqual(2);
      expect(plugins.some((p) => p.name === "hello-world")).toBe(true);
      expect(plugins.some((p) => p.name === "github")).toBe(true);
    });

    it("plugins have required fields", () => {
      for (const p of getMarketplacePlugins()) {
        expect(p.name).toBeTruthy();
        expect(p.displayName).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.version).toBeTruthy();
        expect(typeof p.installed).toBe("boolean");
      }
    });

    it("marks installed plugins", () => {
      const plugins = getMarketplacePlugins();
      const hw = plugins.find((p) => p.name === "hello-world");
      expect(hw?.installed).toBe(true); // hello-world exists in plugins/
    });
  });

  describe("searchMarketplace", () => {
    it("finds plugins by name", () => {
      expect(searchMarketplace("github").some((p) => p.name === "github")).toBe(true);
    });

    it("finds plugins by tag", () => {
      expect(searchMarketplace("issues").some((p) => p.name === "github")).toBe(true);
    });

    it("returns empty for no matches", () => {
      expect(searchMarketplace("xyznonexistent")).toEqual([]);
    });
  });

  describe("getInstalledPlugins", () => {
    it("returns array of installed plugin names", () => {
      const installed = getInstalledPlugins();
      expect(Array.isArray(installed)).toBe(true);
      expect(installed).toContain("hello-world");
      expect(installed).toContain("github");
    });
  });

  describe("isPluginInstalled", () => {
    it("returns true for installed plugins", () => {
      expect(isPluginInstalled("hello-world")).toBe(true);
    });

    it("returns false for uninstalled plugins", () => {
      expect(isPluginInstalled("nonexistent-plugin")).toBe(false);
    });
  });

  describe("installPlugin", () => {
    it("reports builtin plugins as already installed", () => {
      const result = installPlugin("hello-world");
      expect(result.name).toBe("hello-world");
      expect(result.message).toContain("already installed");
    });

    it("returns failure for unknown npm packages", () => {
      const result = installPlugin("definitely-not-a-real-hub-plugin-xyz");
      expect(result.success).toBe(false);
    });
  });

  describe("uninstallPlugin", () => {
    it("prevents uninstalling builtins", () => {
      const result = uninstallPlugin("hello-world");
      expect(result.success).toBe(false);
      expect(result.message).toContain("builtin");
    });

    it("reports not-installed for missing plugins", () => {
      const result = uninstallPlugin("nonexistent-plugin");
      expect(result.success).toBe(false);
      expect(result.message).toContain("not installed");
    });
  });
});

// ── Plugin sandbox tests ───────────────────────────────────────────

import {
  sandboxPlugin,
  getSandboxConfig,
  getPluginSandboxLevel,
  validatePluginStructure,
  canAccessNetwork,
  canAccessFilesystem,
} from "@/lib/plugin-sandbox";

describe("plugin sandbox", () => {
  describe("getSandboxConfig", () => {
    it("returns trusted config with full access", () => {
      const config = getSandboxConfig("trusted");
      expect(config.level).toBe("trusted");
      expect(config.allowNetwork).toBe(true);
      expect(config.allowFs).toBe(true);
      expect(config.timeout).toBeGreaterThan(10000);
    });

    it("returns restricted config with limited access", () => {
      const config = getSandboxConfig("restricted");
      expect(config.level).toBe("restricted");
      expect(config.allowNetwork).toBe(false);
      expect(config.allowFs).toBe(false);
      expect(config.timeout).toBeLessThanOrEqual(5000);
    });
  });

  describe("getPluginSandboxLevel", () => {
    it("trusts built-in plugins", () => {
      expect(getPluginSandboxLevel("hello-world")).toBe("trusted");
      expect(getPluginSandboxLevel("github")).toBe("trusted");
    });

    it("restricts unknown plugins", () => {
      expect(getPluginSandboxLevel("community-plugin")).toBe("restricted");
      expect(getPluginSandboxLevel("random-plugin")).toBe("restricted");
    });
  });

  describe("sandboxPlugin", () => {
    it("wraps hooks in restricted mode", () => {
      const plugin: HubPlugin = {
        name: "test",
        version: "1.0.0",
        onScan: () => [],
        onRender: () => [],
      };
      const config = getSandboxConfig("restricted");
      const { plugin: sandboxed, errors } = sandboxPlugin(plugin, config);
      expect(sandboxed.name).toBe("test");
      expect(errors.length).toBe(0);
    });

    it("passes through in trusted mode", () => {
      const plugin: HubPlugin = { name: "trusted", version: "1.0.0" };
      const config = getSandboxConfig("trusted");
      const { plugin: sandboxed } = sandboxPlugin(plugin, config);
      expect(sandboxed).toBe(plugin); // Same reference
    });

    it("catches errors in restricted hooks", async () => {
      const plugin: HubPlugin = {
        name: "failing",
        version: "1.0.0",
        onScan: () => { throw new Error("boom"); },
      };
      const config = getSandboxConfig("restricted");
      const { plugin: sandboxed, errors } = sandboxPlugin(plugin, config);

      const result = await sandboxed.onScan!({} as any);
      expect(result).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("boom");
    });
  });

  describe("validatePluginStructure", () => {
    it("validates correct plugin", () => {
      const result = validatePluginStructure({ name: "test", version: "1.0.0" });
      expect(result.valid).toBe(true);
    });

    it("rejects missing name", () => {
      const result = validatePluginStructure({ version: "1.0.0" });
      expect(result.valid).toBe(false);
    });

    it("rejects non-function hooks", () => {
      const result = validatePluginStructure({ name: "t", version: "1", onScan: "not a function" });
      expect(result.valid).toBe(false);
    });

    it("rejects non-objects", () => {
      expect(validatePluginStructure(null).valid).toBe(false);
      expect(validatePluginStructure("string").valid).toBe(false);
    });
  });

  describe("permission checks", () => {
    it("canAccessNetwork reflects config", () => {
      expect(canAccessNetwork(getSandboxConfig("trusted"))).toBe(true);
      expect(canAccessNetwork(getSandboxConfig("restricted"))).toBe(false);
    });

    it("canAccessFilesystem reflects config", () => {
      expect(canAccessFilesystem(getSandboxConfig("trusted"))).toBe(true);
      expect(canAccessFilesystem(getSandboxConfig("restricted"))).toBe(false);
    });
  });
});
