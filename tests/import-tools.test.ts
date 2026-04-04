import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

import { convertHtmlToMarkdown, sanitizeFilename, processDirectory } from "../scripts/import-notion";
import { discoverFolders, folderToGroupId, generateConfig } from "../scripts/import-obsidian";
import { parseBookmarksHtml, generatePanelConfig } from "../scripts/import-bookmarks";

const TEST_DIR = resolve(".test-import-tools");

describe("import-notion", () => {
  describe("convertHtmlToMarkdown", () => {
    it("converts headings", () => {
      const md = convertHtmlToMarkdown("<h1>Title</h1><h2>Section</h2><h3>Sub</h3>");
      expect(md).toContain("# Title");
      expect(md).toContain("## Section");
      expect(md).toContain("### Sub");
    });

    it("converts paragraphs", () => {
      const md = convertHtmlToMarkdown("<p>Hello world.</p><p>Second paragraph.</p>");
      expect(md).toContain("Hello world.");
      expect(md).toContain("Second paragraph.");
    });

    it("converts links", () => {
      const md = convertHtmlToMarkdown('<a href="https://example.com">Click here</a>');
      expect(md).toContain("[Click here](https://example.com)");
    });

    it("converts bold and italic", () => {
      const md = convertHtmlToMarkdown("<strong>bold</strong> and <em>italic</em>");
      expect(md).toContain("**bold**");
      expect(md).toContain("*italic*");
    });

    it("converts code blocks", () => {
      const md = convertHtmlToMarkdown("<code>inline</code> and <pre>block code</pre>");
      expect(md).toContain("`inline`");
      expect(md).toContain("```\nblock code\n```");
    });

    it("converts lists", () => {
      const md = convertHtmlToMarkdown("<ul><li>First</li><li>Second</li></ul>");
      expect(md).toContain("- First");
      expect(md).toContain("- Second");
    });

    it("strips HTML tags", () => {
      const md = convertHtmlToMarkdown("<div class='notion'><span>Text</span></div>");
      expect(md).not.toContain("<");
      expect(md).toContain("Text");
    });

    it("decodes HTML entities", () => {
      const md = convertHtmlToMarkdown("&amp; &lt; &gt; &quot;");
      expect(md).toContain("& < > \"");
    });
  });

  describe("sanitizeFilename", () => {
    it("removes Notion UUID from filename", () => {
      expect(sanitizeFilename("My Page abc123def456789012345678901234.html")).toBe("my-page.html");
    });

    it("converts spaces to hyphens", () => {
      expect(sanitizeFilename("My Document.md")).toBe("my-document.md");
    });

    it("lowercases the name", () => {
      expect(sanitizeFilename("README.md")).toBe("readme.md");
    });
  });

  describe("processDirectory", () => {
    const sourceDir = join(TEST_DIR, "notion-export");
    const targetDir = join(TEST_DIR, "notion-output");

    beforeAll(() => {
      mkdirSync(join(sourceDir, "Projects"), { recursive: true });
      writeFileSync(
        join(sourceDir, "Meeting Notes abc123def456789012345678901234.html"),
        "<html><body><h1>Meeting Notes</h1><p>Discussed the roadmap.</p></body></html>"
      );
      writeFileSync(
        join(sourceDir, "Projects", "Roadmap.md"),
        "# Roadmap\n\nQ2 goals here."
      );
      writeFileSync(
        join(sourceDir, "data.csv"),
        "name,value\ntest,123"
      );
      writeFileSync(
        join(sourceDir, "image.png"),
        "binary content"
      );
    });

    afterAll(() => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    it("converts HTML files to markdown", () => {
      const stats = { converted: 0, copied: 0, skipped: 0 };
      processDirectory(sourceDir, targetDir, stats);

      expect(stats.converted).toBe(1);
      const mdFile = join(targetDir, "meeting-notes.md");
      expect(existsSync(mdFile)).toBe(true);
      const content = readFileSync(mdFile, "utf8");
      expect(content).toContain("# Meeting Notes");
      expect(content).toContain("Discussed the roadmap");
    });

    it("copies markdown files as-is", () => {
      const stats = { converted: 0, copied: 0, skipped: 0 };
      processDirectory(sourceDir, targetDir, stats);

      expect(stats.copied).toBeGreaterThanOrEqual(1);
      expect(existsSync(join(targetDir, "projects", "roadmap.md"))).toBe(true);
    });

    it("copies CSV files", () => {
      const stats = { converted: 0, copied: 0, skipped: 0 };
      processDirectory(sourceDir, targetDir, stats);

      expect(existsSync(join(targetDir, "data.csv"))).toBe(true);
    });

    it("skips unsupported file types", () => {
      const stats = { converted: 0, copied: 0, skipped: 0 };
      processDirectory(sourceDir, targetDir, stats);

      expect(stats.skipped).toBe(1); // image.png
    });
  });
});

describe("import-obsidian", () => {
  const vaultDir = join(TEST_DIR, "obsidian-vault");

  beforeAll(() => {
    mkdirSync(join(vaultDir, "Projects"), { recursive: true });
    mkdirSync(join(vaultDir, "Daily Notes"), { recursive: true });
    mkdirSync(join(vaultDir, "References", "Books"), { recursive: true });
    mkdirSync(join(vaultDir, ".obsidian"), { recursive: true });

    writeFileSync(join(vaultDir, "Projects", "roadmap.md"), "# Roadmap");
    writeFileSync(join(vaultDir, "Projects", "ideas.md"), "# Ideas");
    writeFileSync(join(vaultDir, "Daily Notes", "2026-04-01.md"), "# April 1");
    writeFileSync(join(vaultDir, "References", "Books", "deep-work.md"), "# Deep Work");
    writeFileSync(join(vaultDir, ".obsidian", "config.json"), "{}");
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe("discoverFolders", () => {
    it("finds folders with markdown files", () => {
      const folders = discoverFolders(vaultDir);
      expect(folders.length).toBeGreaterThanOrEqual(3);
      expect(folders.some((f) => f.path === "Projects")).toBe(true);
      expect(folders.some((f) => f.path === "Daily Notes")).toBe(true);
    });

    it("skips .obsidian directory", () => {
      const folders = discoverFolders(vaultDir);
      expect(folders.some((f) => f.path.includes(".obsidian"))).toBe(false);
    });

    it("discovers nested folders", () => {
      const folders = discoverFolders(vaultDir);
      expect(folders.some((f) => f.path === "References/Books")).toBe(true);
    });

    it("counts markdown files per folder", () => {
      const folders = discoverFolders(vaultDir);
      const projects = folders.find((f) => f.path === "Projects");
      expect(projects?.fileCount).toBe(2);
    });
  });

  describe("folderToGroupId", () => {
    it("converts folder names to kebab-case IDs", () => {
      expect(folderToGroupId("Daily Notes")).toBe("daily-notes");
      expect(folderToGroupId("Projects")).toBe("projects");
      expect(folderToGroupId("References/Books")).toBe("references-books");
    });
  });

  describe("generateConfig", () => {
    it("generates workspace config", () => {
      const config = generateConfig(vaultDir, "My Vault");
      expect(config.workspace.path).toBe(vaultDir);
      expect(config.workspace.label).toBe("My Vault");
    });

    it("generates groups for each folder", () => {
      const config = generateConfig(vaultDir, "My Vault");
      expect(config.groups.length).toBeGreaterThanOrEqual(3);
      expect(config.groups.some((g) => g.id === "projects")).toBe(true);
    });

    it("generates tabs from top-level folders", () => {
      const config = generateConfig(vaultDir, "My Vault");
      expect(config.tabs.length).toBeGreaterThanOrEqual(2);
      expect(config.tabs.some((t) => t.id === "projects")).toBe(true);
    });

    it("assigns colors to groups", () => {
      const config = generateConfig(vaultDir, "My Vault");
      for (const g of config.groups) {
        expect(g.color).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });
});

describe("import-bookmarks", () => {
  const sampleBookmarks = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Dev Tools</H3>
  <DL><p>
    <DT><A HREF="https://github.com" ADD_DATE="1234567890">GitHub</A>
    <DT><A HREF="https://vercel.com" ADD_DATE="1234567890">Vercel</A>
    <DT><A HREF="https://linear.app" ADD_DATE="1234567890">Linear</A>
  </DL><p>
  <DT><H3>Reading</H3>
  <DL><p>
    <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1234567890">Hacker News</A>
    <DT><A HREF="https://arxiv.org" ADD_DATE="1234567890">arXiv</A>
  </DL><p>
</DL><p>`;

  describe("parseBookmarksHtml", () => {
    it("parses folders", () => {
      const folders = parseBookmarksHtml(sampleBookmarks);
      expect(folders.length).toBe(2);
      expect(folders[0].name).toBe("Dev Tools");
      expect(folders[1].name).toBe("Reading");
    });

    it("parses bookmarks within folders", () => {
      const folders = parseBookmarksHtml(sampleBookmarks);
      const devTools = folders.find((f) => f.name === "Dev Tools");
      expect(devTools?.items.length).toBe(3);
      expect(devTools?.items[0].label).toBe("GitHub");
      expect(devTools?.items[0].url).toBe("https://github.com");
    });

    it("assigns folder to each bookmark", () => {
      const folders = parseBookmarksHtml(sampleBookmarks);
      const reading = folders.find((f) => f.name === "Reading");
      expect(reading?.items[0].folder).toBe("Reading");
    });
  });

  describe("generatePanelConfig", () => {
    it("generates links panel config", () => {
      const folders = parseBookmarksHtml(sampleBookmarks);
      const config = generatePanelConfig(folders);
      expect(config).toContain('"links"');
      expect(config).toContain("GitHub");
      expect(config).toContain("github.com");
    });

    it("filters by folder name", () => {
      const folders = parseBookmarksHtml(sampleBookmarks);
      const config = generatePanelConfig(folders, "Dev");
      expect(config).toContain("GitHub");
      expect(config).not.toContain("Hacker News");
    });

    it("returns comment for no matches", () => {
      const folders = parseBookmarksHtml(sampleBookmarks);
      const config = generatePanelConfig(folders, "nonexistent");
      expect(config).toContain("No bookmarks found");
    });
  });
});
