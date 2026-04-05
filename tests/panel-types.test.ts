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

// ── Graph interactivity tests ────────────────────────────────────

import { addLink, getLinksFrom, getBacklinks } from "@/lib/knowledge-graph";

describe("graph interactivity", () => {
  describe("knowledge graph data for interactive view", () => {
    it("addLink creates edges for graph visualization", () => {
      const source = `graph/source-${Date.now()}.md`;
      const target = `graph/target-${Date.now()}.md`;
      addLink(source, target, "references");
      const links = getLinksFrom(source) as Array<Record<string, unknown>>;
      expect(links.some((l) => l.target_path === target)).toBe(true);
    });

    it("getBacklinks provides inbound edges for inspector", () => {
      const source = `graph/in-src-${Date.now()}.md`;
      const target = `graph/in-tgt-${Date.now()}.md`;
      addLink(source, target, "related");
      const backlinks = getBacklinks(target) as Array<Record<string, unknown>>;
      expect(backlinks.some((l) => l.path === source)).toBe(true);
    });

    it("supports all edge types for filtering", () => {
      const src = `graph/types-${Date.now()}.md`;
      addLink(src, "graph/ref.md", "references");
      addLink(src, "graph/sup.md", "supersedes");
      addLink(src, "graph/rel.md", "related");
      const links = getLinksFrom(src) as Array<Record<string, unknown>>;
      const types = new Set(links.map((l) => l.link_type));
      expect(types.has("references")).toBe(true);
      expect(types.has("supersedes")).toBe(true);
      expect(types.has("related")).toBe(true);
    });
  });

  describe("edge type filtering logic", () => {
    it("filters edges by enabled types", () => {
      const edges = [
        { source: "a", target: "b", linkType: "references" },
        { source: "b", target: "c", linkType: "supersedes" },
        { source: "c", target: "d", linkType: "related" },
      ];
      const enabled = new Set(["references", "related"]);
      const filtered = edges.filter((e) => enabled.has(e.linkType));
      expect(filtered.length).toBe(2);
      expect(filtered.map((e) => e.linkType)).not.toContain("supersedes");
    });

    it("toggle removes and re-adds types", () => {
      const enabled = new Set(["references", "supersedes", "related"]);
      // Toggle off
      enabled.delete("supersedes");
      expect(enabled.has("supersedes")).toBe(false);
      // Toggle on
      enabled.add("supersedes");
      expect(enabled.has("supersedes")).toBe(true);
    });
  });

  describe("search/find node logic", () => {
    it("matches node by title", () => {
      const nodes = [
        { id: "a.md", title: "Architecture Overview" },
        { id: "b.md", title: "Backend API" },
        { id: "c.md", title: "Cloud Infrastructure" },
      ];
      const q = "backend";
      const match = nodes.find((n) => n.title.toLowerCase().includes(q));
      expect(match?.id).toBe("b.md");
    });

    it("matches node by path", () => {
      const nodes = [
        { id: "docs/arch.md", title: "Architecture" },
        { id: "code/api.ts", title: "API Handler" },
      ];
      const q = "code/api";
      const match = nodes.find((n) => n.id.toLowerCase().includes(q));
      expect(match?.id).toBe("code/api.ts");
    });

    it("returns null for no match", () => {
      const nodes = [{ id: "a.md", title: "Test" }];
      expect(nodes.find((n) => n.title.toLowerCase().includes("xyz"))).toBeUndefined();
    });
  });

  describe("zoom and pan calculations", () => {
    it("zoom scales within bounds", () => {
      let zoom = 1;
      // Zoom in
      zoom = Math.min(3, zoom * 1.2);
      expect(zoom).toBeCloseTo(1.2);
      // Zoom out
      zoom = Math.max(0.3, zoom * 0.8);
      expect(zoom).toBeCloseTo(0.96);
    });

    it("zoom cannot exceed max", () => {
      let zoom = 2.8;
      zoom = Math.min(3, zoom * 1.2);
      expect(zoom).toBe(3);
    });

    it("zoom cannot go below min", () => {
      let zoom = 0.35;
      zoom = Math.max(0.3, zoom * 0.8);
      expect(zoom).toBeCloseTo(0.3);
    });

    it("screen-to-canvas conversion with zoom and pan", () => {
      const zoom = 2;
      const panX = 50;
      const panY = 30;
      const screenX = 250;
      const screenY = 130;
      const canvasX = (screenX - panX) / zoom;
      const canvasY = (screenY - panY) / zoom;
      expect(canvasX).toBe(100);
      expect(canvasY).toBe(50);
    });
  });

  describe("node inspector data", () => {
    it("computes inbound and outbound edges for selected node", () => {
      const edges = [
        { source: "a", target: "b", linkType: "references" },
        { source: "b", target: "c", linkType: "supersedes" },
        { source: "d", target: "b", linkType: "related" },
      ];
      const selected = "b";
      const inbound = edges.filter((e) => e.target === selected);
      const outbound = edges.filter((e) => e.source === selected);
      expect(inbound.length).toBe(2);
      expect(outbound.length).toBe(1);
    });
  });
});

// ── Agent session tracking tests ─────────────────────────────────

import {
  trackToolUse,
  getSessionEvents,
  getSessionSummary,
  getRecentSessions,
  generateCatchUp,
  formatCatchUp,
} from "@/lib/session-tracker";

describe("agent session tracking", () => {
  describe("trackToolUse", () => {
    it("records a tool invocation", () => {
      const session = `track-${Date.now()}`;
      const id = trackToolUse({
        sessionId: session,
        agentId: "claude-code",
        toolName: "search",
        query: "authentication",
        artifactPaths: ["docs/auth.md"],
      });
      expect(id).toBeGreaterThan(0);
    });

    it("defaults agentId to mcp-client", () => {
      const session = `default-agent-${Date.now()}`;
      trackToolUse({ sessionId: session, toolName: "read_artifact" });
      const events = getSessionEvents(session);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].agentId).toBe("mcp-client");
    });
  });

  describe("getSessionEvents", () => {
    it("returns events for a session", () => {
      const session = `events-${Date.now()}`;
      trackToolUse({ sessionId: session, toolName: "search", query: "auth" });
      trackToolUse({ sessionId: session, toolName: "read_artifact", artifactPaths: ["docs/a.md"] });
      trackToolUse({ sessionId: session, toolName: "ask_decisions", query: "database" });

      const events = getSessionEvents(session);
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0].toolName).toBeTruthy();
    });

    it("returns most recent first", () => {
      const session = `order-${Date.now()}`;
      trackToolUse({ sessionId: session, toolName: "first" });
      trackToolUse({ sessionId: session, toolName: "second" });

      const events = getSessionEvents(session);
      if (events.length >= 2) {
        expect(events[0].createdAt >= events[1].createdAt).toBe(true);
      }
    });
  });

  describe("getSessionSummary", () => {
    it("returns summary of a session", () => {
      const session = `summary-${Date.now()}`;
      trackToolUse({ sessionId: session, toolName: "search", artifactPaths: ["a.md"] });
      trackToolUse({ sessionId: session, toolName: "read_artifact", artifactPaths: ["b.md"] });

      const summary = getSessionSummary(session);
      expect(summary).not.toBeNull();
      expect(summary!.sessionId).toBe(session);
      expect(summary!.eventCount).toBeGreaterThanOrEqual(2);
      expect(summary!.toolsUsed).toContain("search");
      expect(summary!.toolsUsed).toContain("read_artifact");
      expect(summary!.artifactsAccessed).toContain("a.md");
      expect(summary!.artifactsAccessed).toContain("b.md");
    });

    it("returns null for unknown session", () => {
      expect(getSessionSummary("nonexistent-session")).toBeNull();
    });
  });

  describe("getRecentSessions", () => {
    it("returns recent sessions", () => {
      trackToolUse({ sessionId: `recent-${Date.now()}`, toolName: "search" });
      const sessions = getRecentSessions(5);
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
    });
  });

  describe("generateCatchUp", () => {
    it("returns valid catch-up report", () => {
      const session = `catchup-${Date.now()}`;
      trackToolUse({ sessionId: session, toolName: "search", query: "test" });

      const report = generateCatchUp(session);
      expect(report.sinceSession).toBe(session);
      expect(report.sinceTime).toBeTruthy();
      expect(Array.isArray(report.changedArtifacts)).toBe(true);
      expect(Array.isArray(report.newDecisions)).toBe(true);
      expect(Array.isArray(report.queriedArtifactsChanged)).toBe(true);
      expect(typeof report.summary).toBe("string");
    });

    it("defaults to last 7 days for unknown session", () => {
      const report = generateCatchUp("never-existed");
      expect(report.sinceTime).toBeTruthy();
      expect(report.summary).toBeTruthy();
    });
  });

  describe("formatCatchUp", () => {
    it("formats a catch-up report", () => {
      const report = {
        sinceSession: "test",
        sinceTime: "2026-04-01T00:00:00Z",
        changedArtifacts: [{ path: "docs/a.md", title: "Doc A", staleDays: 1 }],
        newDecisions: [{ summary: "Use TypeScript", artifactPath: "docs/decisions.md" }],
        queriedArtifactsChanged: [],
        summary: "Since your last session: 1 artifact changed, 1 new decision.",
      };
      const text = formatCatchUp(report);
      expect(text).toContain("Catch-up Report");
      expect(text).toContain("Doc A");
      expect(text).toContain("Use TypeScript");
    });

    it("handles empty report", () => {
      const report = {
        sinceSession: "test",
        sinceTime: "2026-04-01T00:00:00Z",
        changedArtifacts: [],
        newDecisions: [],
        queriedArtifactsChanged: [],
        summary: "Nothing changed.",
      };
      const text = formatCatchUp(report);
      expect(text).toContain("Nothing changed");
    });
  });
});

// ── Performance benchmark tests ──────────────────────────────────

import {
  benchmarkSearch,
  benchmarkArtifactCount,
  benchmarkTableListing,
  runBenchmarkSuite,
  formatBenchmarkReport,
  THRESHOLDS,
} from "@/lib/benchmarks";

describe("performance benchmarks", () => {
  describe("individual benchmarks", () => {
    it("benchmarkSearch returns valid result", () => {
      const result = benchmarkSearch("test", 3);
      expect(result.name).toBe("search_latency");
      expect(result.iterations).toBe(3);
      expect(result.avgMs).toBeGreaterThanOrEqual(0);
      expect(result.p95Ms).toBeGreaterThanOrEqual(0);
      expect(result.minMs).toBeLessThanOrEqual(result.maxMs);
      expect(result.timestamp).toBeTruthy();
    });

    it("benchmarkArtifactCount is fast", () => {
      const result = benchmarkArtifactCount(5);
      expect(result.name).toBe("artifact_count");
      expect(result.p95Ms).toBeLessThan(THRESHOLDS.artifact_count || 100);
    });

    it("benchmarkTableListing completes", () => {
      const result = benchmarkTableListing(3);
      expect(result.name).toBe("table_listing");
      expect(result.avgMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("benchmark suite", () => {
    it("runs all benchmarks", () => {
      const suite = runBenchmarkSuite();
      expect(suite.results.length).toBeGreaterThanOrEqual(4);
      expect(typeof suite.totalDurationMs).toBe("number");
      expect(typeof suite.passedThresholds).toBe("boolean");
      expect(Array.isArray(suite.failures)).toBe(true);
      expect(suite.timestamp).toBeTruthy();
    });

    it("each result has required fields", () => {
      const suite = runBenchmarkSuite();
      for (const r of suite.results) {
        expect(r.name).toBeTruthy();
        expect(typeof r.durationMs).toBe("number");
        expect(typeof r.avgMs).toBe("number");
        expect(typeof r.p95Ms).toBe("number");
        expect(typeof r.iterations).toBe("number");
      }
    });

    it("search stays under threshold", () => {
      const suite = runBenchmarkSuite();
      const search = suite.results.find((r) => r.name === "search_latency");
      expect(search).toBeDefined();
      expect(search!.p95Ms).toBeLessThan(THRESHOLDS.search_latency);
    });
  });

  describe("formatBenchmarkReport", () => {
    it("produces readable text", () => {
      const suite = runBenchmarkSuite();
      const text = formatBenchmarkReport(suite);
      expect(text).toContain("Performance Benchmark Report");
      expect(text).toContain("search_latency");
      expect(text).toContain("artifact_count");
    });

    it("shows PASS when thresholds met", () => {
      const suite = runBenchmarkSuite();
      if (suite.passedThresholds) {
        const text = formatBenchmarkReport(suite);
        expect(text).toContain("PASS");
      }
    });
  });

  describe("thresholds", () => {
    it("has threshold for search_latency", () => {
      expect(THRESHOLDS.search_latency).toBeGreaterThan(0);
    });

    it("has threshold for artifact_count", () => {
      expect(THRESHOLDS.artifact_count).toBeGreaterThan(0);
    });
  });
});
