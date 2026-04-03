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
