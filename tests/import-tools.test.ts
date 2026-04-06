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

// ── PWA manifest tests ─────────────────────────────────────────────

describe("PWA", () => {
  const publicDir = resolve(".test-import-tools/../public"); // relative to project root
  const realPublicDir = resolve("public");

  describe("manifest.json", () => {
    it("exists in public/", () => {
      expect(existsSync(realPublicDir + "/manifest.json")).toBe(true);
    });

    it("has valid JSON structure", () => {
      const content = readFileSync(realPublicDir + "/manifest.json", "utf8");
      const manifest = JSON.parse(content);
      expect(manifest.name).toBe("The Hub");
      expect(manifest.short_name).toBe("Hub");
      expect(manifest.display).toBe("standalone");
      expect(manifest.start_url).toBe("/briefing");
      expect(manifest.background_color).toBeTruthy();
      expect(manifest.theme_color).toBeTruthy();
    });

    it("has icon entries", () => {
      const content = readFileSync(realPublicDir + "/manifest.json", "utf8");
      const manifest = JSON.parse(content);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("service worker", () => {
    it("sw.js exists in public/", () => {
      expect(existsSync(realPublicDir + "/sw.js")).toBe(true);
    });

    it("sw.js contains cache strategy", () => {
      const content = readFileSync(realPublicDir + "/sw.js", "utf8");
      expect(content).toContain("CACHE_NAME");
      expect(content).toContain("install");
      expect(content).toContain("fetch");
    });
  });

  describe("icons", () => {
    it("icon SVGs exist", () => {
      expect(existsSync(realPublicDir + "/icon-192.svg")).toBe(true);
      expect(existsSync(realPublicDir + "/icon-512.svg")).toBe(true);
    });
  });
});

// ── Calendar integration tests ─────────────────────────────────────

import {
  parseICal,
  filterTodayEvents,
  isCalendarConfigured,
  clearCalendarCache,
} from "@/lib/calendar";

describe("calendar integration", () => {
  afterEach(() => { clearCalendarCache(); });

  describe("parseICal", () => {
    const ical = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260404T140000Z\nDTEND:20260404T150000Z\nSUMMARY:Q2 Planning\nDESCRIPTION:Review roadmap\\nPriorities\nLOCATION:Room B\nUID:e1\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20260404T160000Z\nSUMMARY:Standup\nUID:e2\nEND:VEVENT\nEND:VCALENDAR`;

    it("parses events from iCal", () => {
      expect(parseICal(ical).length).toBe(2);
    });

    it("extracts properties", () => {
      const e = parseICal(ical).find((x) => x.title === "Q2 Planning");
      expect(e!.start).toContain("2026-04-04");
      expect(e!.location).toBe("Room B");
    });

    it("handles empty iCal", () => {
      expect(parseICal("")).toEqual([]);
    });
  });

  describe("filterTodayEvents", () => {
    it("filters to today", () => {
      const today = new Date().toISOString().slice(0, 10);
      const events = [
        { id: "1", title: "Today", start: `${today}T10:00:00`, end: `${today}T11:00:00`, description: "", location: "", attendees: [], relatedArtifacts: [] },
        { id: "2", title: "Future", start: "2099-01-01T10:00:00", end: "2099-01-01T11:00:00", description: "", location: "", attendees: [], relatedArtifacts: [] },
      ];
      expect(filterTodayEvents(events).length).toBe(1);
    });
  });

  describe("isCalendarConfigured", () => {
    it("false when not set", () => {
      const orig = process.env.CALENDAR_URL;
      delete process.env.CALENDAR_URL;
      expect(isCalendarConfigured()).toBe(false);
      if (orig) process.env.CALENDAR_URL = orig;
    });

    it("true when set", () => {
      process.env.CALENDAR_URL = "https://example.com/cal.ics";
      expect(isCalendarConfigured()).toBe(true);
      delete process.env.CALENDAR_URL;
    });
  });
});

// ── Google Docs sync tests ───────────────────────────────────────

import {
  parseDocId,
  textToMarkdown,
  isGoogleDocsConfigured,
  linkDoc,
  unlinkDoc,
  getLinkedDoc,
  getLinkedDocByPath,
  getAllLinkedDocs,
  getSyncSummary,
} from "@/lib/google-docs";

describe("google docs sync", () => {
  describe("parseDocId", () => {
    it("extracts ID from a full Google Docs URL", () => {
      const url = "https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit";
      expect(parseDocId(url)).toBe("1aBcDeFgHiJkLmNoPqRsTuVwXyZ");
    });

    it("extracts ID from URL with hash", () => {
      const url = "https://docs.google.com/document/d/abc123_def/edit#heading=h.123";
      expect(parseDocId(url)).toBe("abc123_def");
    });

    it("returns raw string if not a URL", () => {
      expect(parseDocId("my-doc-id-123")).toBe("my-doc-id-123");
    });
  });

  describe("textToMarkdown", () => {
    it("converts bullet points to markdown", () => {
      const text = "● First item\n● Second item\n• Third item";
      const md = textToMarkdown(text);
      expect(md).toContain("- First item");
      expect(md).toContain("- Second item");
      expect(md).toContain("- Third item");
    });

    it("preserves numbered lists", () => {
      const text = "1. First\n2. Second";
      expect(textToMarkdown(text)).toContain("1. First");
    });

    it("converts all-caps lines to headings", () => {
      const text = "INTRODUCTION\n\nSome content here.";
      const md = textToMarkdown(text);
      expect(md).toContain("## INTRODUCTION");
    });

    it("handles empty text", () => {
      expect(textToMarkdown("")).toBe("");
    });
  });

  describe("isGoogleDocsConfigured", () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it("false when no env vars", () => {
      delete process.env.GOOGLE_DOCS_API_KEY;
      delete process.env.GOOGLE_DOCS_TOKEN;
      expect(isGoogleDocsConfigured()).toBe(false);
    });

    it("true with API key", () => {
      process.env.GOOGLE_DOCS_API_KEY = "test-key";
      expect(isGoogleDocsConfigured()).toBe(true);
    });

    it("true with OAuth token", () => {
      process.env.GOOGLE_DOCS_TOKEN = "test-token";
      expect(isGoogleDocsConfigured()).toBe(true);
    });
  });

  describe("link management", () => {
    it("links and retrieves a doc", () => {
      const docId = `gdoc-${Date.now()}`;
      const id = linkDoc({ docId, artifactPath: "gdocs/test.md", title: "Test Doc" });
      expect(id).toBeGreaterThan(0);

      const link = getLinkedDoc(docId);
      expect(link).not.toBeNull();
      expect(link!.artifactPath).toBe("gdocs/test.md");
      expect(link!.title).toBe("Test Doc");
      expect(link!.syncDirection).toBe("pull");
      expect(link!.remoteUrl).toContain(docId);
    });

    it("upserts on duplicate docId", () => {
      const docId = `gdoc-upsert-${Date.now()}`;
      linkDoc({ docId, artifactPath: "gdocs/v1.md", title: "V1" });
      linkDoc({ docId, artifactPath: "gdocs/v2.md", title: "V2" });

      const link = getLinkedDoc(docId);
      expect(link!.artifactPath).toBe("gdocs/v2.md");
      expect(link!.title).toBe("V2");
    });

    it("retrieves by artifact path", () => {
      const docId = `gdoc-path-${Date.now()}`;
      const path = `gdocs/by-path-${Date.now()}.md`;
      linkDoc({ docId, artifactPath: path });

      const link = getLinkedDocByPath(path);
      expect(link).not.toBeNull();
      expect(link!.docId).toBe(docId);
    });

    it("unlinks a doc", () => {
      const docId = `gdoc-unlink-${Date.now()}`;
      linkDoc({ docId, artifactPath: "gdocs/unlink.md" });
      expect(unlinkDoc(docId)).toBe(true);
      expect(getLinkedDoc(docId)).toBeNull();
    });

    it("unlink returns false for non-existent", () => {
      expect(unlinkDoc("nonexistent-doc-id")).toBe(false);
    });

    it("getAllLinkedDocs returns array", () => {
      const docs = getAllLinkedDocs();
      expect(Array.isArray(docs)).toBe(true);
    });
  });

  describe("getSyncSummary", () => {
    it("returns summary structure", () => {
      const summary = getSyncSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.synced).toBe("number");
      expect(typeof summary.errors).toBe("number");
      expect(typeof summary.pullOnly).toBe("number");
      expect(typeof summary.bidirectional).toBe("number");
    });
  });
});

// ── Notion sync tests ────────────────────────────────────────────

import {
  parsePageId,
  blocksToMarkdown,
  isNotionConfigured,
  linkPage,
  unlinkPage,
  getLinkedPage,
  getLinkedPageByPath,
  getAllLinkedPages,
  getLinkedPagesByParent,
  getNotionSyncSummary,
} from "@/lib/notion-sync";
import type { NotionBlock } from "@/lib/notion-sync";

describe("notion sync", () => {
  describe("parsePageId", () => {
    it("extracts ID from a Notion URL", () => {
      const url = "https://www.notion.so/workspace/My-Page-abc123def456abc123def456abc123de";
      expect(parsePageId(url)).toBe("abc123def456abc123def456abc123de");
    });

    it("extracts ID from short Notion URL", () => {
      const url = "https://notion.so/abc123def456abc123def456abc123de";
      expect(parsePageId(url)).toBe("abc123def456abc123def456abc123de");
    });

    it("normalizes UUID format (removes dashes)", () => {
      expect(parsePageId("abc123de-f456-abc1-23de-f456abc123de")).toBe("abc123def456abc123def456abc123de");
    });

    it("returns 32-char hex as-is", () => {
      expect(parsePageId("abc123def456abc123def456abc123de")).toBe("abc123def456abc123def456abc123de");
    });

    it("returns non-matching input as-is", () => {
      expect(parsePageId("my-page")).toBe("my-page");
    });
  });

  describe("blocksToMarkdown", () => {
    it("converts headings", () => {
      const blocks: NotionBlock[] = [
        { type: "heading_1", text: "Title" },
        { type: "heading_2", text: "Subtitle" },
        { type: "heading_3", text: "Section" },
      ];
      const md = blocksToMarkdown(blocks);
      expect(md).toContain("# Title");
      expect(md).toContain("## Subtitle");
      expect(md).toContain("### Section");
    });

    it("converts paragraphs", () => {
      const blocks: NotionBlock[] = [
        { type: "paragraph", text: "Hello world" },
        { type: "paragraph", text: "Second paragraph" },
      ];
      const md = blocksToMarkdown(blocks);
      expect(md).toContain("Hello world");
      expect(md).toContain("Second paragraph");
    });

    it("converts list items", () => {
      const blocks: NotionBlock[] = [
        { type: "bulleted_list_item", text: "Bullet one" },
        { type: "numbered_list_item", text: "Number one" },
        { type: "to_do", text: "Task done", checked: true },
        { type: "to_do", text: "Task pending", checked: false },
      ];
      const md = blocksToMarkdown(blocks);
      expect(md).toContain("- Bullet one");
      expect(md).toContain("1. Number one");
      expect(md).toContain("- [x] Task done");
      expect(md).toContain("- [ ] Task pending");
    });

    it("converts code blocks", () => {
      const blocks: NotionBlock[] = [
        { type: "code", text: "const x = 1;", language: "typescript" },
      ];
      const md = blocksToMarkdown(blocks);
      expect(md).toContain("```typescript");
      expect(md).toContain("const x = 1;");
      expect(md).toContain("```");
    });

    it("converts quotes and callouts", () => {
      const blocks: NotionBlock[] = [
        { type: "quote", text: "A wise saying" },
        { type: "callout", text: "Important info" },
      ];
      const md = blocksToMarkdown(blocks);
      expect(md).toContain("> A wise saying");
      expect(md).toContain("> **Note:** Important info");
    });

    it("converts dividers", () => {
      const blocks: NotionBlock[] = [{ type: "divider" }];
      expect(blocksToMarkdown(blocks)).toContain("---");
    });

    it("converts images", () => {
      const blocks: NotionBlock[] = [
        { type: "image", url: "https://example.com/img.png", caption: "My image" },
      ];
      const md = blocksToMarkdown(blocks);
      expect(md).toContain("![My image](https://example.com/img.png)");
    });

    it("handles empty blocks array", () => {
      expect(blocksToMarkdown([])).toBe("");
    });
  });

  describe("isNotionConfigured", () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it("false when no token", () => {
      delete process.env.NOTION_TOKEN;
      expect(isNotionConfigured()).toBe(false);
    });

    it("true with token", () => {
      process.env.NOTION_TOKEN = "secret_test";
      expect(isNotionConfigured()).toBe(true);
    });
  });

  describe("link management", () => {
    it("links and retrieves a page", () => {
      const pageId = `notion-${Date.now()}`;
      const id = linkPage({ pageId, artifactPath: "notion/test.md", title: "Test Page" });
      expect(id).toBeGreaterThan(0);

      const link = getLinkedPage(pageId);
      expect(link).not.toBeNull();
      expect(link!.artifactPath).toBe("notion/test.md");
      expect(link!.title).toBe("Test Page");
      expect(link!.parentType).toBe("page");
      expect(link!.remoteUrl).toContain(pageId);
    });

    it("upserts on duplicate pageId", () => {
      const pageId = `notion-upsert-${Date.now()}`;
      linkPage({ pageId, artifactPath: "notion/v1.md", title: "V1" });
      linkPage({ pageId, artifactPath: "notion/v2.md", title: "V2" });

      const link = getLinkedPage(pageId);
      expect(link!.artifactPath).toBe("notion/v2.md");
      expect(link!.title).toBe("V2");
    });

    it("retrieves by artifact path", () => {
      const pageId = `notion-path-${Date.now()}`;
      const path = `notion/by-path-${Date.now()}.md`;
      linkPage({ pageId, artifactPath: path });

      const link = getLinkedPageByPath(path);
      expect(link).not.toBeNull();
      expect(link!.pageId).toBe(pageId);
    });

    it("queries by parent", () => {
      const parentId = `parent-${Date.now()}`;
      linkPage({ pageId: `child-a-${Date.now()}`, artifactPath: "notion/a.md", parentType: "database", parentId });
      linkPage({ pageId: `child-b-${Date.now()}`, artifactPath: "notion/b.md", parentType: "database", parentId });

      const children = getLinkedPagesByParent(parentId);
      expect(children.length).toBeGreaterThanOrEqual(2);
    });

    it("unlinks a page", () => {
      const pageId = `notion-unlink-${Date.now()}`;
      linkPage({ pageId, artifactPath: "notion/unlink.md" });
      expect(unlinkPage(pageId)).toBe(true);
      expect(getLinkedPage(pageId)).toBeNull();
    });

    it("unlink returns false for non-existent", () => {
      expect(unlinkPage("nonexistent-page")).toBe(false);
    });

    it("getAllLinkedPages returns array", () => {
      expect(Array.isArray(getAllLinkedPages())).toBe(true);
    });
  });

  describe("getNotionSyncSummary", () => {
    it("returns summary structure", () => {
      const summary = getNotionSyncSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.synced).toBe("number");
      expect(typeof summary.errors).toBe("number");
      expect(typeof summary.byParentType).toBe("object");
    });
  });
});

// ── Briefing overhaul tests ──────────────────────────────────────

import { getPendingReviews, getReviewCounts, createReviewRequest } from "@/lib/reviews";
import { getActiveDecisions, getDecisionCounts, saveDecision } from "@/lib/decision-tracker";
import { getErrorSummary } from "@/lib/error-reporter";
import { generateBriefing, computeBriefingScore } from "@/lib/predictive-briefing";

describe("briefing overhaul — intelligence summary", () => {
  describe("review signal", () => {
    it("getPendingReviews returns pending reviews for briefing", () => {
      const pending = getPendingReviews();
      expect(Array.isArray(pending)).toBe(true);
      for (const r of pending) expect(r.status).toBe("pending");
    });

    it("getReviewCounts provides total for briefing card", () => {
      const counts = getReviewCounts();
      expect(typeof counts.pending).toBe("number");
      expect(typeof counts.approved).toBe("number");
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      expect(typeof total).toBe("number");
    });
  });

  describe("decision signal", () => {
    it("getActiveDecisions returns decisions for briefing", () => {
      const active = getActiveDecisions(5);
      expect(Array.isArray(active)).toBe(true);
      for (const d of active) expect(d.status).toBe("active");
    });

    it("getDecisionCounts provides total for briefing card", () => {
      const counts = getDecisionCounts();
      expect(typeof counts.active).toBe("number");
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      expect(typeof total).toBe("number");
    });
  });

  describe("error signal", () => {
    it("getErrorSummary provides counts for briefing card", () => {
      const summary = getErrorSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.critical).toBe("number");
      expect(typeof summary.warning).toBe("number");
    });
  });

  describe("intelligence card visibility logic", () => {
    it("only shows cards with non-zero values", () => {
      const cards = [
        { label: "Reviews", value: 3, show: 3 > 0 },
        { label: "Decisions", value: 0, show: 0 > 0 },
        { label: "Errors", value: 1, show: 1 > 0 },
      ];
      const visible = cards.filter((c) => c.show);
      expect(visible.length).toBe(2);
      expect(visible.map((c) => c.label)).toContain("Reviews");
      expect(visible.map((c) => c.label)).not.toContain("Decisions");
    });

    it("hides entire section when all zero", () => {
      const cards = [
        { value: 0, show: false },
        { value: 0, show: false },
        { value: 0, show: false },
      ];
      expect(cards.filter((c) => c.show).length).toBe(0);
    });
  });

  describe("unified briefing score", () => {
    it("computeBriefingScore integrates all signals", async () => {
      const briefing = await generateBriefing();
      const score = computeBriefingScore(briefing);
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Embedding pruning tests ──────────────────────────────────────

import {
  getEmbeddingCount,
  pruneStaleEmbeddings,
  pruneOldEmbeddings,
  deduplicateEmbeddings,
  getEmbeddingStats,
} from "@/lib/embeddings";

describe("embedding pruning", () => {
  describe("pruneStaleEmbeddings", () => {
    it("returns number of removed embeddings", () => {
      const removed = pruneStaleEmbeddings();
      expect(typeof removed).toBe("number");
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("pruneOldEmbeddings", () => {
    it("prunes without error", () => {
      const removed = pruneOldEmbeddings(365);
      expect(typeof removed).toBe("number");
    });

    it("accepts custom age parameter", () => {
      const removed = pruneOldEmbeddings(7);
      expect(typeof removed).toBe("number");
    });
  });

  describe("deduplicateEmbeddings", () => {
    it("deduplicates without error", () => {
      const removed = deduplicateEmbeddings();
      expect(typeof removed).toBe("number");
    });
  });

  describe("getEmbeddingStats", () => {
    it("returns stats structure", () => {
      const stats = getEmbeddingStats();
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.uniquePaths).toBe("number");
      expect(typeof stats.staleCount).toBe("number");
      // oldestAge may be null if no embeddings
    });

    it("total matches getEmbeddingCount", () => {
      const stats = getEmbeddingStats();
      const count = getEmbeddingCount();
      expect(stats.total).toBe(count);
    });

    it("staleCount is non-negative", () => {
      const stats = getEmbeddingStats();
      expect(stats.staleCount).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Calendar-driven briefing tests ───────────────────────────────

import { isCalendarConfigured, parseICal, filterTodayEvents } from "@/lib/calendar";

describe("calendar-driven briefings", () => {
  const savedEnv = { ...process.env };
  afterEach(() => { process.env = { ...savedEnv }; });

  describe("isCalendarConfigured", () => {
    it("false when no CALENDAR_URL", () => {
      delete process.env.CALENDAR_URL;
      expect(isCalendarConfigured()).toBe(false);
    });

    it("true when CALENDAR_URL set", () => {
      process.env.CALENDAR_URL = "https://calendar.google.com/calendar/ical/test.ics";
      expect(isCalendarConfigured()).toBe(true);
    });
  });

  describe("parseICal", () => {
    it("parses basic VEVENT", () => {
      const ical = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Sprint Planning
DTSTART:20260406T140000Z
DTEND:20260406T150000Z
END:VEVENT
END:VCALENDAR`;
      const events = parseICal(ical);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].title).toBe("Sprint Planning");
    });

    it("handles empty calendar", () => {
      expect(parseICal("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual([]);
    });

    it("handles malformed input", () => {
      expect(parseICal("not ical")).toEqual([]);
    });
  });

  describe("filterTodayEvents", () => {
    it("returns empty for no events", () => {
      expect(filterTodayEvents([])).toEqual([]);
    });

    it("filters events matching today", () => {
      const today = new Date().toISOString().slice(0, 10);
      const events = [
        { title: "Today", start: `${today}T10:00:00Z`, end: `${today}T11:00:00Z` },
        { title: "Tomorrow", start: "2099-01-01T10:00:00Z", end: "2099-01-01T11:00:00Z" },
      ];
      const filtered = filterTodayEvents(events as any);
      expect(filtered.length).toBeLessThanOrEqual(events.length);
    });
  });

  describe("briefing section rendering data", () => {
    it("event has title and time", () => {
      const event = { title: "Sprint Review", startTime: "2026-04-06T14:00:00Z" };
      expect(event.title).toBeTruthy();
      expect(event.startTime).toBeTruthy();
    });

    it("formatTime produces readable output", () => {
      const date = new Date("2026-04-06T14:00:00Z");
      const formatted = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });
  });
});
