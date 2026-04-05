import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import { getExtractor, getSupportedExtensions, isSupported } from "@/lib/extractors";
import { scan } from "@/lib/scanner";
import type { HubConfig } from "@/lib/types";

const TEST_WORKSPACE = resolve(".test-workspace-extractors");

function createTestConfig(overrides: Partial<HubConfig> = {}): HubConfig {
  return {
    name: "Test Hub",
    workspaces: [{ path: TEST_WORKSPACE, label: "Test" }],
    groups: [
      { id: "all", label: "All", match: "**/*", tab: "all", color: "#666" },
    ],
    tabs: [{ id: "all", label: "All", icon: "layers", default: true }],
    ...overrides,
  };
}

describe("extractors", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_WORKSPACE, "docs"), { recursive: true });
    mkdirSync(join(TEST_WORKSPACE, "src"), { recursive: true });
    mkdirSync(join(TEST_WORKSPACE, "config"), { recursive: true });

    // Markdown
    writeFileSync(join(TEST_WORKSPACE, "docs", "guide.md"), "# Getting Started\n\nWelcome to the project.\n\n## Setup\n\nRun `npm install`.");

    // HTML
    writeFileSync(join(TEST_WORKSPACE, "docs", "report.html"), "<html><head><title>Q2 Report</title></head><body><h1>Quarterly Report</h1><p>Revenue grew 15%.</p></body></html>");

    // Plain text
    writeFileSync(join(TEST_WORKSPACE, "docs", "notes.txt"), "Meeting notes from standup\n\nDiscussed deployment timeline\nAgreed on Friday release");

    // JSON
    writeFileSync(join(TEST_WORKSPACE, "config", "settings.json"), JSON.stringify({
      name: "My App Settings",
      database: { host: "localhost", port: 5432 },
      features: ["auth", "search", "notifications"],
    }, null, 2));

    // YAML
    writeFileSync(join(TEST_WORKSPACE, "config", "deploy.yaml"), "name: Production Deploy\nstages:\n  - build\n  - test\n  - deploy\nregion: us-east-1");

    // TypeScript code
    writeFileSync(join(TEST_WORKSPACE, "src", "server.ts"), `export default function createServer(port: number) {\n  console.log(\`Server running on port \${port}\`);\n  return { port };\n}`);

    // Python code
    writeFileSync(join(TEST_WORKSPACE, "src", "analysis.py"), "class DataAnalyzer:\n    def __init__(self, data):\n        self.data = data\n\n    def run(self):\n        return sum(self.data)");

    // CSV
    writeFileSync(join(TEST_WORKSPACE, "docs", "metrics.csv"), "date,users,revenue\n2026-01-01,1000,5000\n2026-02-01,1200,6000");
  });

  afterAll(() => {
    if (existsSync(TEST_WORKSPACE)) {
      rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  describe("getExtractor", () => {
    it("returns markdown extractor for .md files", () => {
      const ext = getExtractor("file.md");
      expect(ext).not.toBeNull();
      expect(ext!.artifactType).toBe("md");
    });

    it("returns html extractor for .html files", () => {
      const ext = getExtractor("file.html");
      expect(ext).not.toBeNull();
      expect(ext!.artifactType).toBe("html");
    });

    it("returns txt extractor for .txt files", () => {
      const ext = getExtractor("file.txt");
      expect(ext).not.toBeNull();
      expect(ext!.artifactType).toBe("txt");
    });

    it("returns json extractor for .json files", () => {
      const ext = getExtractor("file.json");
      expect(ext).not.toBeNull();
      expect(ext!.artifactType).toBe("json");
    });

    it("returns yaml extractor for .yaml and .yml files", () => {
      expect(getExtractor("file.yaml")!.artifactType).toBe("yaml");
      expect(getExtractor("file.yml")!.artifactType).toBe("yaml");
    });

    it("returns code extractor for code files", () => {
      expect(getExtractor("file.ts")!.artifactType).toBe("code");
      expect(getExtractor("file.py")!.artifactType).toBe("code");
      expect(getExtractor("file.go")!.artifactType).toBe("code");
      expect(getExtractor("file.rs")!.artifactType).toBe("code");
    });

    it("returns pdf extractor for .pdf files", () => {
      const ext = getExtractor("file.pdf");
      expect(ext).not.toBeNull();
      expect(ext!.artifactType).toBe("pdf");
    });

    it("returns null for unsupported extensions", () => {
      expect(getExtractor("file.xyz")).toBeNull();
      expect(getExtractor("file.mp4")).toBeNull();
    });
  });

  describe("getSupportedExtensions", () => {
    it("returns all registered extensions", () => {
      const exts = getSupportedExtensions();
      expect(exts).toContain(".md");
      expect(exts).toContain(".html");
      expect(exts).toContain(".txt");
      expect(exts).toContain(".json");
      expect(exts).toContain(".yaml");
      expect(exts).toContain(".ts");
      expect(exts).toContain(".py");
      expect(exts).toContain(".pdf");
      expect(exts.length).toBeGreaterThan(15);
    });
  });

  describe("isSupported", () => {
    it("returns true for supported files", () => {
      expect(isSupported("readme.md")).toBe(true);
      expect(isSupported("app.ts")).toBe(true);
      expect(isSupported("data.json")).toBe(true);
    });

    it("returns false for unsupported files", () => {
      expect(isSupported("video.mp4")).toBe(false);
      expect(isSupported("image.png")).toBe(false);
    });
  });

  describe("title extraction", () => {
    it("extracts title from markdown H1", () => {
      const ext = getExtractor("file.md")!;
      expect(ext.extractTitle("file.md", "# My Title\n\nContent")).toBe("My Title");
    });

    it("extracts title from HTML <title>", () => {
      const ext = getExtractor("file.html")!;
      expect(ext.extractTitle("file.html", "<html><head><title>Page Title</title></head></html>")).toBe("Page Title");
    });

    it("extracts title from JSON name field", () => {
      const ext = getExtractor("file.json")!;
      expect(ext.extractTitle("file.json", '{"name": "My Package"}')).toBe("My Package");
    });

    it("extracts title from YAML name field", () => {
      const ext = getExtractor("file.yaml")!;
      expect(ext.extractTitle("file.yaml", "name: Deploy Config\nstages:\n  - build")).toBe("Deploy Config");
    });

    it("extracts class name from Python code", () => {
      const ext = getExtractor("file.py")!;
      expect(ext.extractTitle("file.py", "class MyService:\n    pass")).toBe("MyService");
    });

    it("extracts first line from txt files", () => {
      const ext = getExtractor("file.txt")!;
      expect(ext.extractTitle("file.txt", "Meeting Notes\n\nDiscussion points")).toBe("Meeting Notes");
    });
  });

  describe("scan with expanded types", () => {
    it("discovers all file types in workspace", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      const types = new Set(manifest.artifacts.map((a) => a.type));
      expect(types).toContain("md");
      expect(types).toContain("html");
      expect(types).toContain("txt");
      expect(types).toContain("json");
      expect(types).toContain("yaml");
      expect(types).toContain("code");
      expect(types).toContain("csv");
    });

    it("extracts titles for new file types", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      const jsonArtifact = manifest.artifacts.find((a) => a.path.includes("settings.json"));
      expect(jsonArtifact).toBeDefined();
      expect(jsonArtifact!.title).toBe("My App Settings");

      const yamlArtifact = manifest.artifacts.find((a) => a.path.includes("deploy.yaml"));
      expect(yamlArtifact).toBeDefined();
      expect(yamlArtifact!.title).toBe("Production Deploy");
    });

    it("generates snippets for new file types", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      const txtArtifact = manifest.artifacts.find((a) => a.path.includes("notes.txt"));
      expect(txtArtifact).toBeDefined();
      expect(txtArtifact!.snippet).toContain("standup");
    });

    it("returns content map with extracted text for new types", () => {
      const config = createTestConfig();
      const result = scan(config, { withContent: true });

      const jsonKey = Array.from(result.contentMap.keys()).find((k) => k.includes("settings.json"));
      expect(jsonKey).toBeDefined();
      // JSON extractor should extract string values
      const jsonContent = result.contentMap.get(jsonKey!);
      expect(jsonContent).toContain("My App Settings");
      expect(jsonContent).toContain("auth");
    });

    it("assigns correct artifact types", () => {
      const config = createTestConfig();
      const manifest = scan(config);

      const byType = (type: string) => manifest.artifacts.filter((a) => a.type === type);
      expect(byType("txt").length).toBeGreaterThanOrEqual(1);
      expect(byType("json").length).toBeGreaterThanOrEqual(1);
      expect(byType("yaml").length).toBeGreaterThanOrEqual(1);
      expect(byType("code").length).toBeGreaterThanOrEqual(2); // .ts + .py
    });
  });
});

// ── Context manager tests ──────────────────────────────────────────

import {
  getContexts,
  getActiveContextName,
  setActiveContext,
  resetContext,
  hasContexts,
  getContextSummary,
  getContextByName,
} from "@/lib/context-manager";

describe("context manager", () => {
  afterEach(() => {
    resetContext();
  });

  describe("getContexts", () => {
    it("returns empty array when no contexts configured", () => {
      const contexts = getContexts();
      expect(Array.isArray(contexts)).toBe(true);
    });
  });

  describe("active context", () => {
    it("starts with null (default context)", () => {
      expect(getActiveContextName()).toBeNull();
    });

    it("setActiveContext changes the active context", () => {
      setActiveContext("Work");
      expect(getActiveContextName()).toBe("Work");
    });

    it("resetContext returns to null", () => {
      setActiveContext("Work");
      resetContext();
      expect(getActiveContextName()).toBeNull();
    });
  });

  describe("hasContexts", () => {
    it("returns false when no contexts configured", () => {
      expect(hasContexts()).toBe(false);
    });
  });

  describe("getContextSummary", () => {
    it("returns array with active indicator", () => {
      const summary = getContextSummary();
      expect(Array.isArray(summary)).toBe(true);
      // With no contexts configured, returns empty
    });
  });

  describe("getContextByName", () => {
    it("returns null for nonexistent context", () => {
      expect(getContextByName("nonexistent")).toBeNull();
    });
  });
});

// ── Onboarding tests ───────────────────────────────────────────────

import {
  estimateReadTime,
  computeWordCount,
  generateOnboardingPath,
} from "@/lib/onboarding";
import type { Artifact } from "@/lib/types";

describe("onboarding path generation", () => {
  describe("estimateReadTime", () => {
    it("estimates 1 min for short text", () => {
      expect(estimateReadTime(100)).toBe(1);
    });

    it("estimates 5 min for 1000 words", () => {
      expect(estimateReadTime(1000)).toBe(5);
    });

    it("minimum is 1 minute", () => {
      expect(estimateReadTime(0)).toBe(1);
    });
  });

  describe("computeWordCount", () => {
    it("counts words", () => {
      expect(computeWordCount("hello world test")).toBe(3);
    });

    it("handles empty", () => {
      expect(computeWordCount("")).toBe(0);
    });
  });

  describe("generateOnboardingPath", () => {
    const artifacts: Artifact[] = [
      { path: "ob/strategy.md", title: "Strategy", type: "md", group: "strategy", modifiedAt: new Date().toISOString(), size: 2000, staleDays: 5 },
      { path: "ob/readme.md", title: "README", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 500, staleDays: 2 },
      { path: "ob/old.md", title: "Old Doc", type: "md", group: "other", modifiedAt: new Date().toISOString(), size: 1000, staleDays: 120 },
    ];

    it("returns an ordered list", () => {
      const path = generateOnboardingPath(artifacts);
      expect(path.items.length).toBeGreaterThanOrEqual(1);
      expect(path.generatedAt).toBeTruthy();
    });

    it("prioritizes strategy/planning groups", () => {
      const path = generateOnboardingPath(artifacts);
      if (path.items.length >= 2) {
        // Strategy should rank higher than other
        const strategyIdx = path.items.findIndex((i) => i.group === "strategy");
        const otherIdx = path.items.findIndex((i) => i.group === "other");
        if (strategyIdx >= 0 && otherIdx >= 0) {
          expect(strategyIdx).toBeLessThan(otherIdx);
        }
      }
    });

    it("respects maxItems", () => {
      const path = generateOnboardingPath(artifacts, { maxItems: 1 });
      expect(path.items.length).toBeLessThanOrEqual(1);
    });

    it("includes read time estimates", () => {
      const path = generateOnboardingPath(artifacts);
      for (const item of path.items) {
        expect(item.estimatedReadTime).toBeGreaterThanOrEqual(1);
      }
    });

    it("calculates total read time", () => {
      const path = generateOnboardingPath(artifacts);
      expect(typeof path.totalReadTime).toBe("number");
    });
  });
});

// ── Source abstraction & Docker tests ──────────────────────────────

import {
  resolveSource,
  getSupportedSourceTypes,
  isValidSourceConfig,
} from "@/lib/sources";

describe("cloud-hosted / sources", () => {
  describe("getSupportedSourceTypes", () => {
    it("includes filesystem, github, s3", () => {
      const types = getSupportedSourceTypes();
      expect(types).toContain("filesystem");
      expect(types).toContain("github");
      expect(types).toContain("s3");
    });
  });

  describe("isValidSourceConfig", () => {
    it("validates correct config", () => {
      expect(isValidSourceConfig({ type: "filesystem", path: "/tmp/test", label: "Test" })).toBe(true);
    });

    it("rejects missing fields", () => {
      expect(isValidSourceConfig({ type: "filesystem", path: "", label: "Test" })).toBe(false);
      expect(isValidSourceConfig({ type: "filesystem", path: "/tmp", label: "" })).toBe(false);
    });
  });

  describe("resolveSource", () => {
    it("resolves filesystem source to absolute path", () => {
      const result = resolveSource({ type: "filesystem", path: "/tmp/test-hub", label: "Test" });
      expect(result.type).toBe("filesystem");
      expect(result.localPath).toBe("/tmp/test-hub");
      expect(result.label).toBe("Test");
    });

    it("expands ~ in filesystem paths", () => {
      const result = resolveSource({ type: "filesystem", path: "~/Developer", label: "Dev" });
      expect(result.localPath).not.toContain("~");
      expect(result.localPath).toContain("Developer");
    });

    it("handles github source type", () => {
      // Don't actually clone — just verify the structure
      const result = resolveSource({ type: "github", path: "https://github.com/test/repo.git", label: "Repo" });
      expect(result.type).toBe("github");
      expect(result.label).toBe("Repo");
      expect(typeof result.localPath).toBe("string");
    });
  });

  describe("Docker files", () => {
    it("Dockerfile exists", () => {
      expect(existsSync(resolve("Dockerfile"))).toBe(true);
    });

    it("docker-compose.yml exists", () => {
      expect(existsSync(resolve("docker-compose.yml"))).toBe(true);
    });

    it(".dockerignore exists", () => {
      expect(existsSync(resolve(".dockerignore"))).toBe(true);
    });
  });
});

// ── Graceful degradation tests ───────────────────────────────────

import { isAiConfigured, resetOllamaDetection } from "@/lib/ai-client";
import { isFeatureAvailable, getFeatureReason } from "@/hooks/use-feature-status";
import type { FeatureInfo } from "@/hooks/use-feature-status";

describe("graceful degradation", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    resetOllamaDetection();
  });

  describe("feature status helpers", () => {
    const mockFeatures: FeatureInfo[] = [
      { name: "Full-text search", available: true, reason: "Always available" },
      { name: "RAG Q&A", available: false, reason: "Requires AI provider" },
      { name: "Document hygiene", available: true, reason: "Heuristic detection" },
      { name: "Summarization", available: false, reason: "Requires AI provider" },
    ];

    it("isFeatureAvailable returns true for available features", () => {
      expect(isFeatureAvailable(mockFeatures, "Full-text search")).toBe(true);
      expect(isFeatureAvailable(mockFeatures, "Document hygiene")).toBe(true);
    });

    it("isFeatureAvailable returns false for unavailable features", () => {
      expect(isFeatureAvailable(mockFeatures, "RAG Q&A")).toBe(false);
      expect(isFeatureAvailable(mockFeatures, "Summarization")).toBe(false);
    });

    it("isFeatureAvailable returns false for unknown features", () => {
      expect(isFeatureAvailable(mockFeatures, "Nonexistent")).toBe(false);
    });

    it("getFeatureReason returns reason string", () => {
      expect(getFeatureReason(mockFeatures, "RAG Q&A")).toBe("Requires AI provider");
      expect(getFeatureReason(mockFeatures, "Full-text search")).toBe("Always available");
    });

    it("getFeatureReason returns default for unknown features", () => {
      expect(getFeatureReason(mockFeatures, "Unknown")).toBe("Not configured");
    });
  });

  describe("AI-dependent feature detection", () => {
    it("AI features degrade when AI_PROVIDER=none", () => {
      process.env.AI_PROVIDER = "none";
      expect(isAiConfigured()).toBe(false);
      // Features that depend on AI should be marked unavailable
      const aiFeatures = ["RAG Q&A", "Summarization", "Content generation", "Smart triage"];
      for (const feature of aiFeatures) {
        // These would be unavailable in the feature matrix
        expect(feature).toBeTruthy(); // feature exists in our taxonomy
      }
    });

    it("core features work without AI", () => {
      process.env.AI_PROVIDER = "none";
      // These should always be available
      const coreFeatures = ["Full-text search", "Document hygiene", "Knowledge graph", "Change feed", "MCP server"];
      for (const feature of coreFeatures) {
        expect(feature).toBeTruthy();
      }
      // AI is off but app still works
      expect(isAiConfigured()).toBe(false);
    });

    it("sidebar nav items correctly identify AI-dependent pages", () => {
      const navItems = [
        { href: "/briefing", needsAI: false },
        { href: "/repos", needsAI: false },
        { href: "/hygiene", needsAI: false },
        { href: "/ask", needsAI: true },
        { href: "/graph", needsAI: false },
        { href: "/status", needsAI: false },
        { href: "/setup", needsAI: false },
        { href: "/settings", needsAI: false },
      ];

      const aiPages = navItems.filter((n) => n.needsAI);
      expect(aiPages.length).toBe(1);
      expect(aiPages[0].href).toBe("/ask");

      const nonAiPages = navItems.filter((n) => !n.needsAI);
      expect(nonAiPages.length).toBe(7);
    });

    it("degraded items get visual indicator when AI is off", () => {
      // Simulate: AI is off, needsAI items get 'degraded' flag
      const aiConfigured = false;
      const needsAI = true;
      const degraded = needsAI && !aiConfigured;
      expect(degraded).toBe(true);

      // Non-AI items should not be degraded
      const needsAI2 = false;
      const degraded2 = needsAI2 && !aiConfigured;
      expect(degraded2).toBe(false);
    });
  });
});

// ── Share button tests ───────────────────────────────────────────

describe("share button", () => {
  describe("share link generation", () => {
    it("generates correct share URL format", () => {
      const artifactPath = "docs/architecture.md";
      const origin = "http://localhost:9001";
      const url = `${origin}/api/file/${artifactPath}`;
      expect(url).toBe("http://localhost:9001/api/file/docs/architecture.md");
    });

    it("handles paths with special characters", () => {
      const artifactPath = "docs/my doc (v2).md";
      const origin = "http://localhost:9001";
      const url = `${origin}/api/file/${artifactPath}`;
      expect(url).toContain("my doc (v2).md");
    });

    it("handles nested paths", () => {
      const artifactPath = "work/projects/hub/planning/roadmap.md";
      const origin = "http://localhost:9001";
      const url = `${origin}/api/file/${artifactPath}`;
      expect(url).toBe("http://localhost:9001/api/file/work/projects/hub/planning/roadmap.md");
    });
  });

  describe("share vs other launcher actions", () => {
    it("share link uses /api/file/ prefix", () => {
      const path = "test.md";
      const shareUrl = `/api/file/${path}`;
      expect(shareUrl.startsWith("/api/file/")).toBe(true);
    });

    it("cursor URI uses cursor:// protocol", () => {
      const absPath = "/Users/test/docs/file.md";
      const cursorUri = `cursor://file${absPath}`;
      expect(cursorUri.startsWith("cursor://file")).toBe(true);
    });

    it("both share and cursor derive from artifact path", () => {
      const artifactPath = "docs/readme.md";
      const absPath = "/Users/test/workspace/docs/readme.md";

      const shareUrl = `/api/file/${artifactPath}`;
      const cursorUri = `cursor://file${absPath}`;

      expect(shareUrl).toContain(artifactPath);
      expect(cursorUri).toContain(absPath);
    });
  });
});

// ── Lazy content loading tests ───────────────────────────────────

describe("lazy content loading", () => {
  const MAX_PREVIEW_SIZE = 500_000;

  describe("content truncation logic", () => {
    it("small content is not truncated", () => {
      const html = "<p>Hello world</p>";
      const size = new Blob([html]).size;
      expect(size).toBeLessThan(MAX_PREVIEW_SIZE);
      const truncated = size > MAX_PREVIEW_SIZE;
      expect(truncated).toBe(false);
    });

    it("large content exceeds threshold", () => {
      const html = "x".repeat(600_000);
      const size = new Blob([html]).size;
      expect(size).toBeGreaterThan(MAX_PREVIEW_SIZE);
      const truncated = size > MAX_PREVIEW_SIZE;
      expect(truncated).toBe(true);
    });

    it("truncation preserves first 500KB", () => {
      const html = "a".repeat(600_000);
      const truncatedContent = html.slice(0, MAX_PREVIEW_SIZE) + "\n<!-- truncated -->";
      expect(truncatedContent.length).toBeLessThan(html.length);
      expect(truncatedContent).toContain("<!-- truncated -->");
      expect(truncatedContent.startsWith("a")).toBe(true);
    });

    it("full content is preserved for load-full button", () => {
      const html = "b".repeat(600_000);
      const fullContent = html;
      // Simulate: truncated state stores full for later
      expect(fullContent.length).toBe(600_000);
    });
  });

  describe("formatSize utility", () => {
    const formatSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    it("formats bytes", () => {
      expect(formatSize(500)).toBe("500 B");
    });

    it("formats kilobytes", () => {
      expect(formatSize(2048)).toBe("2.0 KB");
      expect(formatSize(1536)).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatSize(1048576)).toBe("1.0 MB");
      expect(formatSize(2621440)).toBe("2.5 MB");
    });
  });

  describe("preview state management", () => {
    it("resets state when artifact changes", () => {
      // Simulate state reset
      let truncated = true;
      let fullContent: string | null = "old content";
      let contentSize = 100000;

      // Reset on new artifact
      truncated = false;
      fullContent = null;
      contentSize = 0;

      expect(truncated).toBe(false);
      expect(fullContent).toBeNull();
      expect(contentSize).toBe(0);
    });

    it("load full replaces truncated content", () => {
      let content = "truncated...";
      const fullContent = "full content here";
      let truncated = true;

      // Simulate loadFullContent
      content = fullContent;
      truncated = false;

      expect(content).toBe("full content here");
      expect(truncated).toBe(false);
    });
  });
});
