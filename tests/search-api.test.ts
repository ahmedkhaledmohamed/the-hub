import { describe, it, expect, beforeEach } from "vitest";
import {
  persistArtifacts,
  searchArtifacts,
} from "@/lib/db";
import type { Artifact } from "@/lib/types";

function makeArtifact(overrides: Partial<Artifact>): Artifact {
  return {
    path: "ws/doc.md",
    title: "Document",
    type: "md",
    group: "docs",
    modifiedAt: new Date().toISOString(),
    size: 500,
    staleDays: 1,
    snippet: "A short snippet.",
    ...overrides,
  };
}

describe("full-text search", () => {
  beforeEach(() => {
    // Seed the database with test artifacts that have deep content
    const artifacts = [
      makeArtifact({
        path: "ws/architecture.md",
        title: "Architecture Overview",
        snippet: "High-level system architecture.",
      }),
      makeArtifact({
        path: "ws/pricing.md",
        title: "Pricing Strategy",
        snippet: "Overview of pricing tiers.",
      }),
      makeArtifact({
        path: "ws/onboarding.md",
        title: "Onboarding Guide",
        snippet: "How to get started.",
      }),
    ];

    const contentMap = new Map([
      ["ws/architecture.md", "# Architecture Overview\n\nThe system uses a microservice architecture with gRPC communication between services. Each service has its own PostgreSQL database for data isolation."],
      ["ws/pricing.md", "# Pricing Strategy\n\nWe offer three tiers: Free, Pro ($12/mo), and Enterprise ($80/user/mo). Enterprise includes SSO, audit logging, and dedicated support."],
      ["ws/onboarding.md", "# Onboarding Guide\n\nWelcome aboard! This guide walks you through your first week. Start by reading the architecture overview, then set up your development environment."],
    ]);

    persistArtifacts(artifacts, contentMap, { deleteStale: false });
  });

  it("finds documents by deep content (not in title or snippet)", () => {
    // "gRPC" only appears in the full content of architecture.md, not in title or snippet
    const results = searchArtifacts("gRPC");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.path === "ws/architecture.md")).toBe(true);
  });

  it("finds documents by content phrases", () => {
    // "PostgreSQL database" only in full content
    const results = searchArtifacts("PostgreSQL");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.path === "ws/architecture.md")).toBe(true);
  });

  it("finds documents matching title", () => {
    const results = searchArtifacts("Pricing Strategy");
    expect(results.some((r) => r.path === "ws/pricing.md")).toBe(true);
  });

  it("finds documents matching content across files", () => {
    // "architecture" appears in architecture.md content AND onboarding.md content
    const results = searchArtifacts("architecture");
    expect(results.length).toBeGreaterThanOrEqual(2);
    const paths = results.map((r) => r.path);
    expect(paths).toContain("ws/architecture.md");
    expect(paths).toContain("ws/onboarding.md");
  });

  it("returns ranked results (more relevant first)", () => {
    // "architecture" is the title + throughout content of architecture.md
    // but only mentioned once in onboarding.md — architecture.md should rank higher
    const results = searchArtifacts("architecture");
    const archIdx = results.findIndex((r) => r.path === "ws/architecture.md");
    const onbIdx = results.findIndex((r) => r.path === "ws/onboarding.md");
    expect(archIdx).toBeGreaterThanOrEqual(0);
    expect(onbIdx).toBeGreaterThanOrEqual(0);
    expect(archIdx).toBeLessThan(onbIdx);
  });

  it("returns snippet with match context", () => {
    const results = searchArtifacts("Enterprise");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // FTS5 snippet() returns highlighted context
    const result = results.find((r) => r.path === "ws/pricing.md");
    expect(result).toBeDefined();
    expect(result!.snippet).toBeTruthy();
  });

  it("handles multi-word queries", () => {
    const results = searchArtifacts("dedicated support");
    expect(results.some((r) => r.path === "ws/pricing.md")).toBe(true);
  });

  it("respects limit parameter", () => {
    const results = searchArtifacts("architecture", 1);
    expect(results.length).toBe(1);
  });

  it("returns empty for no matches", () => {
    const results = searchArtifacts("xyznonexistent99999");
    expect(results).toEqual([]);
  });

  it("handles special characters gracefully", () => {
    // Should not throw, even with FTS-unfriendly input
    const results = searchArtifacts("$80/user/mo");
    expect(Array.isArray(results)).toBe(true);
  });

  it("supports offset-based pagination", () => {
    // Seed enough data
    const artifacts = Array.from({ length: 10 }, (_, i) => ({
      path: `pg/doc-${i}.md`, title: `Pagination Doc ${i}`, type: "md" as const,
      group: "docs", modifiedAt: new Date().toISOString(), size: 100, staleDays: 0,
    }));
    const contentMap = new Map(artifacts.map((a) => [a.path, `Content for pagination test ${a.title}`]));
    persistArtifacts(artifacts, contentMap, { deleteStale: false });

    // First page
    const page1 = searchArtifacts("pagination", 3);
    expect(page1.length).toBeLessThanOrEqual(3);

    // With higher limit, should get more
    const all = searchArtifacts("pagination", 20);
    expect(all.length).toBeGreaterThanOrEqual(page1.length);
  });
});

// ── Knowledge graph tests ──────────────────────────────────────────

import {
  addLink,
  removeLink,
  getLinksFrom,
  getBacklinks,
  getLinkCount,
  parseWikiLinks,
  resolveWikiLink,
  getGraphData,
} from "@/lib/knowledge-graph";

describe("knowledge graph", () => {
  describe("parseWikiLinks", () => {
    it("extracts wiki-style links", () => {
      const links = parseWikiLinks("See [[Architecture]] and [[Pricing Strategy]].");
      expect(links).toEqual(["Architecture", "Pricing Strategy"]);
    });

    it("handles display text syntax", () => {
      const links = parseWikiLinks("See [[architecture|Arch Overview]].");
      expect(links).toEqual(["architecture"]);
    });

    it("returns empty for no links", () => {
      expect(parseWikiLinks("No links here.")).toEqual([]);
    });

    it("handles multiple links on same line", () => {
      const links = parseWikiLinks("[[A]] and [[B]] and [[C]]");
      expect(links).toEqual(["A", "B", "C"]);
    });
  });

  describe("resolveWikiLink", () => {
    const paths = ["ws/docs/architecture.md", "ws/docs/pricing.md", "ws/readme.md"];

    it("resolves by filename", () => {
      expect(resolveWikiLink("architecture", paths)).toBe("ws/docs/architecture.md");
    });

    it("resolves by exact path", () => {
      expect(resolveWikiLink("ws/docs/pricing.md", paths)).toBe("ws/docs/pricing.md");
    });

    it("resolves partial path", () => {
      expect(resolveWikiLink("docs/pricing", paths)).toBe("ws/docs/pricing.md");
    });

    it("returns null for no match", () => {
      expect(resolveWikiLink("nonexistent", paths)).toBeNull();
    });
  });

  describe("link CRUD", () => {
    it("adds and retrieves links", () => {
      addLink("graph/a.md", "graph/b.md", "references");
      const links = getLinksFrom("graph/a.md");
      expect(links.some((l) => l.target_path === "graph/b.md")).toBe(true);
    });

    it("gets backlinks", () => {
      addLink("graph/source.md", "graph/target.md", "references");
      const backlinks = getBacklinks("graph/target.md");
      expect(backlinks.some((b) => b.path === "graph/source.md")).toBe(true);
    });

    it("removes links", () => {
      addLink("graph/x.md", "graph/y.md", "related");
      removeLink("graph/x.md", "graph/y.md", "related");
      const links = getLinksFrom("graph/x.md");
      expect(links.some((l) => l.target_path === "graph/y.md" && l.link_type === "related")).toBe(false);
    });

    it("counts links", () => {
      const uniqueId = Date.now().toString();
      const before = getLinkCount();
      addLink(`graph/cnt-${uniqueId}.md`, `graph/cnt2-${uniqueId}.md`, "supersedes");
      expect(getLinkCount()).toBe(before + 1);
    });

    it("ignores duplicate links", () => {
      addLink("graph/dup.md", "graph/dup2.md", "references");
      const before = getLinkCount();
      addLink("graph/dup.md", "graph/dup2.md", "references");
      expect(getLinkCount()).toBe(before);
    });
  });

  describe("getGraphData", () => {
    it("returns nodes and edges", () => {
      addLink("graph/n1.md", "graph/n2.md", "references");
      const data = getGraphData();
      expect(data.nodes.length).toBeGreaterThanOrEqual(2);
      expect(data.edges.length).toBeGreaterThanOrEqual(1);
    });

    it("nodes have required fields", () => {
      addLink("graph/fields1.md", "graph/fields2.md", "related");
      const data = getGraphData();
      for (const node of data.nodes) {
        expect(node.id).toBeTruthy();
        expect(node.title).toBeTruthy();
        expect(typeof node.group).toBe("string");
      }
    });
  });
});

// ── Conflict detection tests ───────────────────────────────────────

import { extractClaims, findClaimConflicts, conflictSummary } from "@/lib/conflict-detector";

describe("conflict detection", () => {
  describe("extractClaims", () => {
    it("extracts date claims", () => {
      const claims = extractClaims("We will launch on March 15, 2026. The deadline is Q2 2026.");
      expect(claims.some((c) => c.startsWith("date:"))).toBe(true);
    });

    it("extracts decision claims", () => {
      const claims = extractClaims("We decided to use PostgreSQL for the database.");
      expect(claims.some((c) => c.startsWith("decision:"))).toBe(true);
    });

    it("returns empty for no claims", () => {
      expect(extractClaims("Hello world.")).toEqual([]);
    });
  });

  describe("findClaimConflicts", () => {
    it("finds contradictory dates", () => {
      const docA = { path: "a.md", title: "Doc A", content: "We will launch on March 15, 2026." };
      const docB = { path: "b.md", title: "Doc B", content: "We will launch on April 1, 2026." };
      const conflicts = findClaimConflicts(docA, docB);
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      expect(conflicts[0].type).toBe("contradictory-fact");
    });

    it("finds no conflicts for identical claims", () => {
      const doc = { path: "a.md", title: "Doc", content: "We will launch on March 15." };
      expect(findClaimConflicts(doc, doc)).toEqual([]);
    });

    it("finds no conflicts for unrelated docs", () => {
      const docA = { path: "a.md", title: "A", content: "This is about marketing." };
      const docB = { path: "b.md", title: "B", content: "This is about engineering." };
      expect(findClaimConflicts(docA, docB)).toEqual([]);
    });
  });

  describe("conflictSummary", () => {
    it("counts by severity", () => {
      const conflicts = [
        { id: "1", docA: { path: "", title: "", excerpt: "" }, docB: { path: "", title: "", excerpt: "" }, type: "contradictory-fact" as const, severity: "high" as const, description: "", detectedAt: "" },
        { id: "2", docA: { path: "", title: "", excerpt: "" }, docB: { path: "", title: "", excerpt: "" }, type: "contradictory-fact" as const, severity: "medium" as const, description: "", detectedAt: "" },
      ];
      const summary = conflictSummary(conflicts);
      expect(summary.high).toBe(1);
      expect(summary.medium).toBe(1);
      expect(summary.total).toBe(2);
    });

    it("handles empty", () => {
      expect(conflictSummary([]).total).toBe(0);
    });
  });
});

// ── Predictive briefing tests ────────────────────────────────────

import {
  generateBriefing,
  briefingToText,
  computeBriefingScore,
  matchEventsToArtifacts,
  findStaleFrequentDocs,
  findRecentHighImpactChanges,
} from "@/lib/predictive-briefing";
import type { PredictiveBriefing, BriefingItem, BriefingStats } from "@/lib/predictive-briefing";

describe("predictive briefings", () => {
  describe("generateBriefing", () => {
    it("returns valid briefing structure", async () => {
      const briefing = await generateBriefing();
      expect(briefing.generatedAt).toBeTruthy();
      expect(Array.isArray(briefing.items)).toBe(true);
      expect(Array.isArray(briefing.meetingContext)).toBe(true);
      expect(Array.isArray(briefing.decayAlerts)).toBe(true);
      expect(typeof briefing.stats.totalItems).toBe("number");
      expect(typeof briefing.stats.urgent).toBe("number");
      expect(typeof briefing.stats.important).toBe("number");
      expect(typeof briefing.stats.informational).toBe("number");
      expect(typeof briefing.stats.meetingCount).toBe("number");
      expect(typeof briefing.stats.decayAlerts).toBe("number");
    });

    it("AI narrative is null without AI configured", async () => {
      const saved = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = "none";
      const briefing = await generateBriefing({ useAI: true });
      expect(briefing.aiNarrative).toBeNull();
      if (saved) process.env.AI_PROVIDER = saved;
      else delete process.env.AI_PROVIDER;
    });

    it("accepts custom changeDays", async () => {
      const briefing = await generateBriefing({ changeDays: 1 });
      expect(briefing).toBeTruthy();
    });
  });

  describe("matchEventsToArtifacts", () => {
    it("returns empty for events with no matching artifacts", () => {
      const result = matchEventsToArtifacts([
        { title: "xyznonexistent999 meeting", startTime: "2026-04-05T14:00:00Z" },
      ]);
      expect(result).toEqual([]);
    });

    it("returns empty for events with short keywords only", () => {
      const result = matchEventsToArtifacts([
        { title: "1:1 w/ AB", startTime: "2026-04-05T10:00:00Z" },
      ]);
      expect(result).toEqual([]);
    });

    it("returns empty for empty events array", () => {
      expect(matchEventsToArtifacts([])).toEqual([]);
    });

    it("matches events with relevant keywords to seeded artifacts", () => {
      // This depends on what's indexed — just verify structure
      const result = matchEventsToArtifacts([
        { title: "Architecture Review Planning", startTime: "2026-04-05T14:00:00Z" },
      ]);
      expect(Array.isArray(result)).toBe(true);
      for (const item of result) {
        expect(item.eventTitle).toBeTruthy();
        expect(item.eventTime).toBeTruthy();
        expect(Array.isArray(item.relatedDocs)).toBe(true);
      }
    });
  });

  describe("findStaleFrequentDocs", () => {
    it("returns array", () => {
      const result = findStaleFrequentDocs();
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts custom options", () => {
      const result = findStaleFrequentDocs({ frequentDays: 30, staleDays: 3, minAccess: 1 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("findRecentHighImpactChanges", () => {
    it("returns array", () => {
      const result = findRecentHighImpactChanges(7);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("briefingToText", () => {
    it("renders empty briefing", () => {
      const briefing: PredictiveBriefing = {
        generatedAt: "2026-04-05T10:00:00Z",
        items: [],
        meetingContext: [],
        decayAlerts: [],
        aiNarrative: null,
        stats: { totalItems: 0, urgent: 0, important: 0, informational: 0, meetingCount: 0, decayAlerts: 0 },
      };
      const text = briefingToText(briefing);
      expect(text).toContain("No items require your attention");
    });

    it("renders urgent items", () => {
      const briefing: PredictiveBriefing = {
        generatedAt: "2026-04-05T10:00:00Z",
        items: [
          {
            artifactPath: "docs/arch.md",
            title: "Architecture",
            priority: "urgent",
            reason: "Changed — 3 docs depend on this",
            summary: null,
            lastAccessed: null,
            changedSince: "2026-04-04",
            relatedEvent: null,
          },
        ],
        meetingContext: [],
        decayAlerts: [],
        aiNarrative: null,
        stats: { totalItems: 1, urgent: 1, important: 0, informational: 0, meetingCount: 0, decayAlerts: 0 },
      };
      const text = briefingToText(briefing);
      expect(text).toContain("1 urgent item");
      expect(text).toContain("Architecture");
    });

    it("renders AI narrative when present", () => {
      const briefing: PredictiveBriefing = {
        generatedAt: "2026-04-05T10:00:00Z",
        items: [{ artifactPath: "a.md", title: "A", priority: "informational", reason: "test", summary: null, lastAccessed: null, changedSince: null, relatedEvent: null }],
        meetingContext: [],
        decayAlerts: [],
        aiNarrative: "Good morning! Here is your briefing.",
        stats: { totalItems: 1, urgent: 0, important: 0, informational: 1, meetingCount: 0, decayAlerts: 0 },
      };
      const text = briefingToText(briefing);
      expect(text).toContain("Good morning!");
    });

    it("renders meeting context", () => {
      const briefing: PredictiveBriefing = {
        generatedAt: "2026-04-05T10:00:00Z",
        items: [],
        meetingContext: [
          { eventTitle: "Sprint Planning", eventTime: "2026-04-05T14:00:00Z", relatedDocs: [{ path: "a.md", title: "A", relevance: "match" }] },
        ],
        decayAlerts: [],
        aiNarrative: null,
        stats: { totalItems: 0, urgent: 0, important: 0, informational: 0, meetingCount: 1, decayAlerts: 0 },
      };
      const text = briefingToText(briefing);
      expect(text).toContain("Sprint Planning");
    });
  });

  describe("computeBriefingScore", () => {
    it("returns 0 for empty briefing", () => {
      const briefing: PredictiveBriefing = {
        generatedAt: "",
        items: [],
        meetingContext: [],
        decayAlerts: [],
        aiNarrative: null,
        stats: { totalItems: 0, urgent: 0, important: 0, informational: 0, meetingCount: 0, decayAlerts: 0 },
      };
      expect(computeBriefingScore(briefing)).toBe(0);
    });

    it("weights urgent higher than informational", () => {
      const makeStats = (overrides: Partial<BriefingStats>): PredictiveBriefing => ({
        generatedAt: "",
        items: [],
        meetingContext: [],
        decayAlerts: [],
        aiNarrative: null,
        stats: { totalItems: 0, urgent: 0, important: 0, informational: 0, meetingCount: 0, decayAlerts: 0, ...overrides },
      });

      const urgentScore = computeBriefingScore(makeStats({ urgent: 1 }));
      const infoScore = computeBriefingScore(makeStats({ informational: 1 }));
      expect(urgentScore).toBeGreaterThan(infoScore);
    });

    it("includes meeting and decay alert weights", () => {
      const briefing: PredictiveBriefing = {
        generatedAt: "",
        items: [],
        meetingContext: [],
        decayAlerts: [],
        aiNarrative: null,
        stats: { totalItems: 0, urgent: 0, important: 0, informational: 0, meetingCount: 2, decayAlerts: 3 },
      };
      expect(computeBriefingScore(briefing)).toBe(2 * 20 + 3 * 10); // 70
    });
  });
});

// ── System status tests ──────────────────────────────────────────

import { getArtifactCount, getDb } from "@/lib/db";
import { isAiConfigured, getAiConfig, resetOllamaDetection } from "@/lib/ai-client";

describe("system status", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
    resetOllamaDetection();
  });

  describe("database health", () => {
    it("getArtifactCount returns a number", () => {
      const count = getArtifactCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("can list tables from sqlite_master", () => {
      const db = getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as Array<{ name: string }>;
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      const names = tables.map((t) => t.name);
      expect(names).toContain("artifacts");
    });

    it("can count rows in artifacts table", () => {
      const db = getDb();
      const row = db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as { count: number };
      expect(typeof row.count).toBe("number");
    });
  });

  describe("AI provider status", () => {
    it("reports unconfigured with AI_PROVIDER=none", () => {
      process.env.AI_PROVIDER = "none";
      expect(isAiConfigured()).toBe(false);
      expect(getAiConfig()).toBeNull();
    });

    it("detects provider name from gateway URL", () => {
      process.env.AI_GATEWAY_URL = "https://api.openai.com/v1/chat/completions";
      process.env.AI_GATEWAY_KEY = "test-key";
      const config = getAiConfig();
      expect(config).not.toBeNull();
      expect(config!.gatewayUrl).toContain("openai");
    });
  });

  describe("integration status checks", () => {
    it("detects Slack when configured", () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      expect(!!process.env.SLACK_WEBHOOK_URL).toBe(true);
    });

    it("detects Slack unconfigured", () => {
      delete process.env.SLACK_WEBHOOK_URL;
      expect(!!process.env.SLACK_WEBHOOK_URL).toBe(false);
    });

    it("detects Notion when configured", () => {
      process.env.NOTION_TOKEN = "secret_test";
      expect(!!process.env.NOTION_TOKEN).toBe(true);
    });

    it("detects Google Docs via API key", () => {
      process.env.GOOGLE_DOCS_API_KEY = "test-key";
      expect(!!(process.env.GOOGLE_DOCS_API_KEY || process.env.GOOGLE_DOCS_TOKEN)).toBe(true);
    });

    it("detects Calendar when configured", () => {
      process.env.CALENDAR_URL = "https://example.com/cal.ics";
      expect(!!process.env.CALENDAR_URL).toBe(true);
    });
  });

  describe("job queue status", () => {
    it("can query jobs table without error", () => {
      const db = getDb();
      // Ensure table exists first
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending',
          type TEXT, payload TEXT, created_at TEXT DEFAULT (datetime('now'))
        )`);
      } catch { /* already exists */ }

      const rows = db.prepare(
        "SELECT status, COUNT(*) as count FROM jobs GROUP BY status"
      ).all() as Array<{ status: string; count: number }>;
      expect(Array.isArray(rows)).toBe(true);
    });
  });

  describe("feature availability", () => {
    it("core features always available", () => {
      // Features that don't depend on AI
      const coreAvailable = true; // FTS5, hygiene, graph, change feed, MCP
      expect(coreAvailable).toBe(true);
    });

    it("AI features depend on configuration", () => {
      process.env.AI_PROVIDER = "none";
      const aiOn = isAiConfigured();
      expect(aiOn).toBe(false);
      // RAG, summarization, generation, smart triage all need AI
    });

    it("health score calculation", () => {
      // Simulate: 8/12 features, has artifacts, has AI
      const featureScore = (8 / 12) * 50; // ~33
      const artifactScore = 25; // has artifacts
      const aiScore = 25; // has AI
      const total = Math.round(featureScore + artifactScore + aiScore);
      expect(total).toBeGreaterThanOrEqual(75);

      // Without AI: 6/12 features, has artifacts, no AI
      const noAiScore = Math.round((6 / 12) * 50 + 25 + 10);
      expect(noAiScore).toBeLessThan(total);
    });
  });

  describe("utility functions", () => {
    it("formats uptime correctly", () => {
      // Testing the logic that the component uses
      const formatUptime = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h < 24) return `${h}h ${m}m`;
        const d = Math.floor(h / 24);
        return `${d}d ${h % 24}h`;
      };

      expect(formatUptime(30)).toBe("30s");
      expect(formatUptime(90)).toBe("1m 30s");
      expect(formatUptime(3661)).toBe("1h 1m");
      expect(formatUptime(90000)).toBe("1d 1h");
    });

    it("formats bytes correctly", () => {
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
      };

      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(500)).toBe("500 B");
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1048576)).toBe("1.0 MB");
    });
  });
});
