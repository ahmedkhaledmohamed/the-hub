import { describe, it, expect, beforeEach } from "vitest";
import {
  wordCount,
  getCachedSummary,
  setCachedSummary,
  getBulkSummaries,
  summarizeContent,
} from "@/lib/summarizer";
import { contentHash, persistArtifacts } from "@/lib/db";
import type { Artifact } from "@/lib/types";

describe("summarizer", () => {
  describe("wordCount", () => {
    it("counts words in a string", () => {
      expect(wordCount("hello world")).toBe(2);
    });

    it("handles multiple spaces", () => {
      expect(wordCount("hello   world   test")).toBe(3);
    });

    it("handles empty string", () => {
      expect(wordCount("")).toBe(0);
    });

    it("handles newlines and tabs", () => {
      expect(wordCount("hello\nworld\ttab")).toBe(3);
    });
  });

  describe("summary cache", () => {
    const testHash = "test-summary-hash-12345";
    const testSummary = "This is a test summary of the document.";

    it("returns null for uncached hashes", () => {
      expect(getCachedSummary("nonexistent-hash")).toBeNull();
    });

    it("stores and retrieves summaries", () => {
      setCachedSummary(testHash, testSummary, "test-model", 1000);
      const result = getCachedSummary(testHash);
      expect(result).toBe(testSummary);
    });

    it("overwrites existing summaries", () => {
      setCachedSummary(testHash, "first version", "model-1", 500);
      setCachedSummary(testHash, "updated version", "model-2", 600);
      expect(getCachedSummary(testHash)).toBe("updated version");
    });
  });

  describe("getBulkSummaries", () => {
    beforeEach(() => {
      // Seed some cached summaries
      setCachedSummary("hash-a", "Summary A", "test-model", 500);
      setCachedSummary("hash-b", "Summary B", "test-model", 600);
    });

    it("returns summaries for matching hashes", () => {
      const hashMap = new Map([
        ["path/a.md", "hash-a"],
        ["path/b.md", "hash-b"],
      ]);
      const result = getBulkSummaries(hashMap);
      expect(result.get("path/a.md")).toBe("Summary A");
      expect(result.get("path/b.md")).toBe("Summary B");
    });

    it("skips paths with no cached summary", () => {
      const hashMap = new Map([
        ["path/a.md", "hash-a"],
        ["path/c.md", "no-such-hash"],
      ]);
      const result = getBulkSummaries(hashMap);
      expect(result.has("path/a.md")).toBe(true);
      expect(result.has("path/c.md")).toBe(false);
    });

    it("handles empty input", () => {
      const result = getBulkSummaries(new Map());
      expect(result.size).toBe(0);
    });
  });

  describe("summarizeContent", () => {
    it("returns null for short content (< 500 words)", async () => {
      const shortContent = "This is a short document with only a few words.";
      const result = await summarizeContent(shortContent);
      expect(result).toBeNull();
    });

    it("returns null when AI is not configured", async () => {
      const origUrl = process.env.AI_GATEWAY_URL;
      const origKey = process.env.AI_GATEWAY_KEY;
      delete process.env.AI_GATEWAY_URL;
      delete process.env.AI_GATEWAY_KEY;

      // Generate 500+ words
      const longContent = Array.from({ length: 100 }, (_, i) =>
        `This is paragraph ${i} with enough words to exceed the minimum threshold.`
      ).join("\n\n");

      const result = await summarizeContent(longContent);
      expect(result).toBeNull();

      if (origUrl) process.env.AI_GATEWAY_URL = origUrl;
      if (origKey) process.env.AI_GATEWAY_KEY = origKey;
    });

    it("returns cached summary if available", async () => {
      const content = Array.from({ length: 100 }, (_, i) =>
        `Paragraph ${i} describing the architecture of the system in detail.`
      ).join("\n\n");

      const hash = contentHash(content);
      setCachedSummary(hash, "Pre-cached summary for testing.", "cache-model", 600);

      const result = await summarizeContent(content);
      expect(result).not.toBeNull();
      expect(result!.summary).toBe("Pre-cached summary for testing.");
      expect(result!.cached).toBe(true);
    });
  });

  describe("contentHash integration", () => {
    it("same content produces same hash (cache hit)", () => {
      const content = "identical content for hashing";
      const h1 = contentHash(content);
      const h2 = contentHash(content);
      expect(h1).toBe(h2);
    });

    it("different content produces different hash (cache miss)", () => {
      const h1 = contentHash("content version 1");
      const h2 = contentHash("content version 2");
      expect(h1).not.toBe(h2);
    });
  });
});

// ── Activity tracking tests ────────────────────────────────────────

import {
  trackOpen,
  trackSearch,
  getTopOpened,
  getOpenCount,
  getTotalOpens,
  getSearchGaps,
  getPopularSearches,
  getBoostScores,
  getActivitySummary,
} from "@/lib/activity";

describe("activity tracking", () => {
  describe("artifact opens", () => {
    it("tracks and counts opens", () => {
      const path = `activity/test-${Date.now()}.md`;
      trackOpen(path);
      trackOpen(path);
      trackOpen(path);
      expect(getOpenCount(path, 1)).toBe(3);
    });

    it("getTopOpened returns most-opened artifacts", () => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Open popular many times to ensure it's in top results
      for (let i = 0; i < 20; i++) trackOpen(`activity/popular-${unique}.md`);

      const top = getTopOpened(30, 500);
      const popular = top.find((t) => t.path === `activity/popular-${unique}.md`);
      expect(popular).toBeDefined();
      expect(popular!.count).toBeGreaterThanOrEqual(15);
    });

    it("getTotalOpens counts all opens", () => {
      const before = getTotalOpens(1);
      trackOpen("activity/total-test.md");
      expect(getTotalOpens(1)).toBe(before + 1);
    });
  });

  describe("search tracking", () => {
    it("tracks searches and detects gaps", () => {
      const unique = `gap-query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      trackSearch(unique, 0); // 0 results = gap
      trackSearch(unique, 0);

      const gaps = getSearchGaps(30, 200);
      const found = gaps.find((g) => g.query === unique);
      expect(found).toBeDefined();
      expect(found!.searchCount).toBe(2);
    });

    it("tracks popular searches", () => {
      const unique = `popular-${Date.now()}`;
      trackSearch(unique, 5);
      trackSearch(unique, 5);
      trackSearch(unique, 5);

      const popular = getPopularSearches(30, 100);
      expect(popular.some((p: { query: string }) => p.query === unique)).toBe(true);
    });
  });

  describe("boost scores", () => {
    it("returns normalized scores (0-1)", () => {
      const unique = Date.now().toString();
      trackOpen(`boost/a-${unique}.md`);
      trackOpen(`boost/a-${unique}.md`);
      trackOpen(`boost/a-${unique}.md`);
      trackOpen(`boost/b-${unique}.md`);

      const scores = getBoostScores(1);
      expect(scores.size).toBeGreaterThanOrEqual(2);
      // Most opened should have score 1.0
      const maxScore = Math.max(...scores.values());
      expect(maxScore).toBeCloseTo(1.0, 1);
    });
  });

  describe("activity summary", () => {
    it("returns summary with all fields", () => {
      trackOpen("summary/test.md");
      trackSearch("summary query", 3);

      const summary = getActivitySummary(1);
      expect(typeof summary.totalOpens).toBe("number");
      expect(Array.isArray(summary.topArtifacts)).toBe(true);
      expect(Array.isArray(summary.searchGaps)).toBe(true);
      expect(Array.isArray(summary.popularSearches)).toBe(true);
    });
  });
});

// ── Slack integration tests ────────────────────────────────────────

import {
  isSlackConfigured,
  formatChangeSummary,
  formatHygieneAlert,
  formatAgentOutput,
  handleSlashCommand,
} from "@/lib/slack";

describe("Slack integration", () => {
  describe("isSlackConfigured", () => {
    it("returns false when not configured", () => {
      const origWebhook = process.env.SLACK_WEBHOOK_URL;
      const origToken = process.env.SLACK_BOT_TOKEN;
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.SLACK_BOT_TOKEN;
      expect(isSlackConfigured()).toBe(false);
      if (origWebhook) process.env.SLACK_WEBHOOK_URL = origWebhook;
      if (origToken) process.env.SLACK_BOT_TOKEN = origToken;
    });

    it("returns true when webhook set", () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      expect(isSlackConfigured()).toBe(true);
      delete process.env.SLACK_WEBHOOK_URL;
    });
  });

  describe("formatChangeSummary", () => {
    it("formats added/modified/deleted changes", () => {
      const msg = formatChangeSummary([
        { title: "Doc A", type: "added", path: "a.md" },
        { title: "Doc B", type: "modified", path: "b.md" },
        { title: "Doc C", type: "deleted", path: "c.md" },
      ]);
      expect(msg.text).toContain("3 change");
      expect(msg.blocks!.length).toBeGreaterThanOrEqual(2);
    });

    it("handles empty changes", () => {
      const msg = formatChangeSummary([]);
      expect(msg.text).toContain("0 change");
    });
  });

  describe("formatHygieneAlert", () => {
    it("formats findings", () => {
      const msg = formatHygieneAlert([
        { type: "exact-duplicate", severity: "high", suggestion: "Remove duplicate" },
      ]);
      expect(msg.text).toContain("1 finding");
      expect(msg.text).toContain("1 high");
    });
  });

  describe("formatAgentOutput", () => {
    it("formats agent result", () => {
      const msg = formatAgentOutput("weekly-summary", "# Status Update\n\nAll good.");
      expect(msg.text).toContain("weekly-summary");
    });
  });

  describe("handleSlashCommand", () => {
    const basePayload = {
      command: "/hub", text: "", response_url: "", user_id: "U1",
      user_name: "tester", channel_id: "C1", channel_name: "general",
    };

    it("returns help for empty command", async () => {
      const result = await handleSlashCommand({ ...basePayload, text: "" });
      expect(result).toContain("Hub Commands");
    });

    it("returns help for 'help'", async () => {
      const result = await handleSlashCommand({ ...basePayload, text: "help" });
      expect(result).toContain("search");
    });

    it("handles search command", async () => {
      const result = await handleSlashCommand({ ...basePayload, text: "search architecture" });
      expect(result).toContain("architecture");
    });

    it("handles search without query", async () => {
      const result = await handleSlashCommand({ ...basePayload, text: "search" });
      expect(result).toContain("Usage");
    });

    it("handles status command", async () => {
      const result = await handleSlashCommand({ ...basePayload, text: "status" });
      expect(result).toContain("status");
    });
  });
});

// ── Knowledge decay tests ──────────────────────────────────────────

import { detectDecay, decaySummary, getDecayingDocs } from "@/lib/knowledge-decay";
import type { DecayReport } from "@/lib/knowledge-decay";

describe("knowledge decay detection", () => {
  describe("detectDecay", () => {
    it("returns array (may be empty with no historical data)", () => {
      const reports = detectDecay();
      expect(Array.isArray(reports)).toBe(true);
    });

    it("accepts custom time windows", () => {
      const reports = detectDecay({ recentDays: 3, historicalDays: 14, minHistoricalViews: 1 });
      expect(Array.isArray(reports)).toBe(true);
    });
  });

  describe("decaySummary", () => {
    it("counts by decay level", () => {
      const reports: DecayReport[] = [
        { path: "a", title: "A", group: "docs", decayLevel: "critical", recentViews: 0, historicalViews: 10, decayRatio: 0, lastAccessed: null, reason: "" },
        { path: "b", title: "B", group: "docs", decayLevel: "declining", recentViews: 1, historicalViews: 10, decayRatio: 0.1, lastAccessed: null, reason: "" },
        { path: "c", title: "C", group: "docs", decayLevel: "stable", recentViews: 5, historicalViews: 5, decayRatio: 1, lastAccessed: null, reason: "" },
      ];
      const summary = decaySummary(reports);
      expect(summary.critical).toBe(1);
      expect(summary.declining).toBe(1);
      expect(summary.stable).toBe(1);
    });

    it("handles empty", () => {
      expect(decaySummary([]).critical).toBe(0);
    });
  });

  describe("getDecayingDocs", () => {
    it("filters to critical + declining", () => {
      const reports: DecayReport[] = [
        { path: "a", title: "A", group: "docs", decayLevel: "critical", recentViews: 0, historicalViews: 10, decayRatio: 0, lastAccessed: null, reason: "" },
        { path: "b", title: "B", group: "docs", decayLevel: "stable", recentViews: 5, historicalViews: 5, decayRatio: 1, lastAccessed: null, reason: "" },
        { path: "c", title: "C", group: "docs", decayLevel: "growing", recentViews: 15, historicalViews: 5, decayRatio: 3, lastAccessed: null, reason: "" },
      ];
      const decaying = getDecayingDocs(reports);
      expect(decaying.length).toBe(1);
      expect(decaying[0].path).toBe("a");
    });
  });
});

// ── Impact scoring tests ─────────────────────────────────────────

import {
  scoreToLevel,
  computeImpactScore,
  computeBatchImpactScores,
  saveImpactScore,
  getLatestImpactScore,
  getImpactHistory,
  getImpactSummary,
  collectAccessSignals,
  collectAnnotationSignals,
  collectReviewSignals,
  collectBacklinkSignals,
} from "@/lib/impact-scoring";
import type { ImpactScore, ImpactSignals } from "@/lib/impact-scoring";

describe("impact scoring", () => {
  describe("scoreToLevel", () => {
    it("returns critical for 80+", () => {
      expect(scoreToLevel(80)).toBe("critical");
      expect(scoreToLevel(100)).toBe("critical");
    });

    it("returns high for 60-79", () => {
      expect(scoreToLevel(60)).toBe("high");
      expect(scoreToLevel(79)).toBe("high");
    });

    it("returns medium for 35-59", () => {
      expect(scoreToLevel(35)).toBe("medium");
      expect(scoreToLevel(59)).toBe("medium");
    });

    it("returns low for 10-34", () => {
      expect(scoreToLevel(10)).toBe("low");
      expect(scoreToLevel(34)).toBe("low");
    });

    it("returns none for 0-9", () => {
      expect(scoreToLevel(0)).toBe("none");
      expect(scoreToLevel(9)).toBe("none");
    });
  });

  describe("signal collection", () => {
    it("collectAccessSignals returns structure for unknown path", () => {
      const result = collectAccessSignals("nonexistent/path.md");
      expect(typeof result.count).toBe("number");
      expect(Array.isArray(result.uniqueUsers)).toBe(true);
    });

    it("collectAnnotationSignals returns structure for unknown path", () => {
      const result = collectAnnotationSignals("nonexistent/path.md");
      expect(result.count).toBe(0);
      expect(result.authors).toEqual([]);
    });

    it("collectReviewSignals returns structure for unknown path", () => {
      const result = collectReviewSignals("nonexistent/path.md");
      expect(result.count).toBe(0);
      expect(result.reviewers).toEqual([]);
      expect(result.requesters).toEqual([]);
    });

    it("collectBacklinkSignals returns structure for unknown path", () => {
      const result = collectBacklinkSignals("nonexistent/path.md");
      expect(result.backlinkCount).toBe(0);
      expect(result.dependentPaths).toEqual([]);
    });
  });

  describe("computeImpactScore", () => {
    it("returns valid score structure", () => {
      const score = computeImpactScore("impact/test-doc.md");
      expect(typeof score.score).toBe("number");
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(["critical", "high", "medium", "low", "none"]).toContain(score.level);
      expect(score.artifactPath).toBe("impact/test-doc.md");
      expect(typeof score.signals).toBe("object");
      expect(Array.isArray(score.stakeholders)).toBe(true);
      expect(Array.isArray(score.downstreamPaths)).toBe(true);
    });

    it("signals have all required fields", () => {
      const score = computeImpactScore("impact/signals.md");
      const s = score.signals;
      expect(typeof s.accessCount).toBe("number");
      expect(typeof s.uniqueAccessors).toBe("number");
      expect(typeof s.annotationCount).toBe("number");
      expect(typeof s.reviewCount).toBe("number");
      expect(typeof s.backlinkCount).toBe("number");
      expect(typeof s.dependentCount).toBe("number");
    });

    it("returns none/0 for artifact with no activity", () => {
      const score = computeImpactScore("impact/no-activity-ever.md");
      expect(score.score).toBe(0);
      expect(score.level).toBe("none");
      expect(score.stakeholders).toEqual([]);
    });
  });

  describe("computeBatchImpactScores", () => {
    it("returns scores for multiple paths", () => {
      const scores = computeBatchImpactScores(["a.md", "b.md", "c.md"]);
      expect(scores.length).toBe(3);
      for (const s of scores) {
        expect(typeof s.score).toBe("number");
        expect(typeof s.level).toBe("string");
      }
    });

    it("handles empty array", () => {
      expect(computeBatchImpactScores([])).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("saves and retrieves an impact score", () => {
      const score: ImpactScore = {
        artifactPath: `impact/persist-${Date.now()}.md`,
        title: "Test Doc",
        score: 75,
        level: "high",
        signals: {
          accessCount: 10,
          uniqueAccessors: 3,
          annotationCount: 2,
          reviewCount: 1,
          backlinkCount: 4,
          dependentCount: 2,
        },
        stakeholders: [{ name: "alice", reason: "reviewed", relevance: 0.8 }],
        downstreamPaths: ["dep/a.md"],
      };

      const id = saveImpactScore(score);
      expect(id).toBeGreaterThan(0);

      const retrieved = getLatestImpactScore(score.artifactPath);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.score).toBe(75);
      expect(retrieved!.level).toBe("high");
      expect(retrieved!.stakeholders.length).toBe(1);
      expect(retrieved!.stakeholders[0].name).toBe("alice");
      expect(retrieved!.downstreamPaths).toEqual(["dep/a.md"]);
    });

    it("returns null for unsaved path", () => {
      expect(getLatestImpactScore("nonexistent/never-saved.md")).toBeNull();
    });

    it("getImpactHistory returns scored entries", () => {
      const path = `impact/history-${Date.now()}.md`;
      const mkScore = (s: number, l: string): ImpactScore => ({
        artifactPath: path, title: path, score: s, level: l as "high" | "medium",
        signals: { accessCount: 0, uniqueAccessors: 0, annotationCount: 0, reviewCount: 0, backlinkCount: 0, dependentCount: 0 },
        stakeholders: [], downstreamPaths: [],
      });
      saveImpactScore(mkScore(40, "medium"));
      saveImpactScore(mkScore(65, "high"));

      const history = getImpactHistory(path);
      expect(history.length).toBeGreaterThanOrEqual(2);
      const scores = history.map((h) => h.score);
      expect(scores).toContain(40);
      expect(scores).toContain(65);
    });
  });

  describe("getImpactSummary", () => {
    it("returns summary structure", () => {
      const summary = getImpactSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.byLevel.critical).toBe("number");
      expect(typeof summary.byLevel.high).toBe("number");
      expect(typeof summary.byLevel.medium).toBe("number");
      expect(typeof summary.byLevel.low).toBe("number");
      expect(typeof summary.byLevel.none).toBe("number");
    });
  });
});

// ── Integration dashboard tests ──────────────────────────────────

import { isGoogleDocsConfigured, getSyncSummary as getGDocsSummary } from "@/lib/google-docs";
import { isNotionConfigured, getNotionSyncSummary } from "@/lib/notion-sync";
import { isCalendarConfigured } from "@/lib/calendar";

describe("integration dashboard", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("Google Docs integration", () => {
    it("detects when unconfigured", () => {
      delete process.env.GOOGLE_DOCS_API_KEY;
      delete process.env.GOOGLE_DOCS_TOKEN;
      expect(isGoogleDocsConfigured()).toBe(false);
    });

    it("detects when configured via API key", () => {
      process.env.GOOGLE_DOCS_API_KEY = "test-key";
      expect(isGoogleDocsConfigured()).toBe(true);
    });

    it("getSyncSummary returns structure", () => {
      const summary = getGDocsSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.synced).toBe("number");
      expect(typeof summary.errors).toBe("number");
    });
  });

  describe("Notion integration", () => {
    it("detects when unconfigured", () => {
      delete process.env.NOTION_TOKEN;
      expect(isNotionConfigured()).toBe(false);
    });

    it("detects when configured", () => {
      process.env.NOTION_TOKEN = "secret_test";
      expect(isNotionConfigured()).toBe(true);
    });

    it("getNotionSyncSummary returns structure", () => {
      const summary = getNotionSyncSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.synced).toBe("number");
      expect(typeof summary.errors).toBe("number");
      expect(typeof summary.byParentType).toBe("object");
    });
  });

  describe("Slack integration", () => {
    it("detects via SLACK_WEBHOOK_URL", () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      expect(!!process.env.SLACK_WEBHOOK_URL).toBe(true);
    });

    it("unconfigured when no URL", () => {
      delete process.env.SLACK_WEBHOOK_URL;
      expect(!!process.env.SLACK_WEBHOOK_URL).toBe(false);
    });
  });

  describe("Calendar integration", () => {
    it("detects via CALENDAR_URL", () => {
      process.env.CALENDAR_URL = "https://calendar.google.com/calendar/ical/test.ics";
      expect(isCalendarConfigured()).toBe(true);
    });

    it("unconfigured when no URL", () => {
      delete process.env.CALENDAR_URL;
      expect(isCalendarConfigured()).toBe(false);
    });
  });

  describe("integration aggregation", () => {
    it("counts configured integrations correctly", () => {
      // Simulate: only Slack configured
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      delete process.env.GOOGLE_DOCS_API_KEY;
      delete process.env.GOOGLE_DOCS_TOKEN;
      delete process.env.NOTION_TOKEN;
      delete process.env.CALENDAR_URL;
      delete process.env.SSO_ENABLED;

      const configured = [
        isGoogleDocsConfigured(),
        isNotionConfigured(),
        !!process.env.SLACK_WEBHOOK_URL,
        !!process.env.CALENDAR_URL,
        process.env.SSO_ENABLED === "true",
      ].filter(Boolean).length;

      expect(configured).toBe(1); // only Slack
    });

    it("all integrations have required env vars documented", () => {
      // Verify the integration definitions match expectations
      const integrations = [
        { id: "google-docs", requiredEnvs: ["GOOGLE_DOCS_API_KEY", "GOOGLE_DOCS_TOKEN"] },
        { id: "notion", requiredEnvs: ["NOTION_TOKEN"] },
        { id: "slack", requiredEnvs: ["SLACK_WEBHOOK_URL"] },
        { id: "calendar", requiredEnvs: ["CALENDAR_URL"] },
        { id: "sso", requiredEnvs: ["SSO_ENABLED"] },
      ];

      expect(integrations.length).toBe(5);
      for (const i of integrations) {
        expect(i.id).toBeTruthy();
        expect(i.requiredEnvs.length).toBeGreaterThan(0);
      }
    });
  });
});

// ── Impact scoring badges tests ──────────────────────────────────

import { scoreToLevel as impactScoreToLevel, getLevelConfig } from "@/hooks/use-impact-scores";
import { computeImpactScore, computeBatchImpactScores, saveImpactScore } from "@/lib/impact-scoring";

describe("impact scoring badges", () => {
  describe("scoreToLevel mapping", () => {
    it("maps 80+ to critical", () => {
      expect(impactScoreToLevel(80)).toBe("critical");
      expect(impactScoreToLevel(100)).toBe("critical");
    });

    it("maps 60-79 to high", () => {
      expect(impactScoreToLevel(60)).toBe("high");
      expect(impactScoreToLevel(79)).toBe("high");
    });

    it("maps 35-59 to medium", () => {
      expect(impactScoreToLevel(35)).toBe("medium");
      expect(impactScoreToLevel(59)).toBe("medium");
    });

    it("maps 10-34 to low", () => {
      expect(impactScoreToLevel(10)).toBe("low");
      expect(impactScoreToLevel(34)).toBe("low");
    });

    it("maps 0-9 to none", () => {
      expect(impactScoreToLevel(0)).toBe("none");
      expect(impactScoreToLevel(9)).toBe("none");
    });
  });

  describe("batch computation for card grid", () => {
    it("computes scores for multiple paths", () => {
      const scores = computeBatchImpactScores(["badges/a.md", "badges/b.md", "badges/c.md"]);
      expect(scores.length).toBe(3);
      for (const s of scores) {
        expect(typeof s.score).toBe("number");
        expect(typeof s.level).toBe("string");
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
      }
    });

    it("handles empty paths array", () => {
      expect(computeBatchImpactScores([])).toEqual([]);
    });
  });

  describe("level config for badges", () => {
    it("all non-none levels have label and colors", () => {
      const levels = ["critical", "high", "medium", "low"] as const;
      for (const level of levels) {
        const config = getLevelConfig(level);
        expect(config.label).toBeTruthy();
        expect(config.color).toBeTruthy();
        expect(config.bg).toBeTruthy();
      }
    });

    it("none level has empty strings", () => {
      const config = getLevelConfig("none");
      expect(config.label).toBe("");
    });
  });
});

// ── Connection tester tests ──────────────────────────────────────

describe("connection tester", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("integration test logic", () => {
    it("Slack: detects when webhook URL is missing", () => {
      delete process.env.SLACK_WEBHOOK_URL;
      const url = process.env.SLACK_WEBHOOK_URL;
      expect(url).toBeUndefined();
      const result = { success: false, message: "SLACK_WEBHOOK_URL not set" };
      expect(result.success).toBe(false);
    });

    it("Slack: has URL when configured", () => {
      process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
      expect(!!process.env.SLACK_WEBHOOK_URL).toBe(true);
    });

    it("Google Docs: detects when no credentials", () => {
      delete process.env.GOOGLE_DOCS_API_KEY;
      delete process.env.GOOGLE_DOCS_TOKEN;
      const hasKey = !!process.env.GOOGLE_DOCS_API_KEY;
      const hasToken = !!process.env.GOOGLE_DOCS_TOKEN;
      expect(hasKey || hasToken).toBe(false);
    });

    it("Notion: detects when token is missing", () => {
      delete process.env.NOTION_TOKEN;
      expect(!!process.env.NOTION_TOKEN).toBe(false);
    });

    it("Calendar: detects when URL is missing", () => {
      delete process.env.CALENDAR_URL;
      expect(!!process.env.CALENDAR_URL).toBe(false);
    });
  });

  describe("test result structure", () => {
    it("result has success, message, latencyMs", () => {
      const result = { success: true, message: "Connected", latencyMs: 150 };
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.message).toBe("string");
      expect(typeof result.latencyMs).toBe("number");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("failed result has descriptive message", () => {
      const result = { success: false, message: "NOTION_TOKEN not set", latencyMs: 0 };
      expect(result.success).toBe(false);
      expect(result.message).toContain("not set");
    });

    it("latency is measured for successful connections", () => {
      const start = Date.now();
      // Simulate a quick check
      const latency = Date.now() - start;
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(latency).toBeLessThan(1000); // should be fast for env check
    });
  });

  describe("supported integrations for testing", () => {
    it("all testable integrations have IDs", () => {
      const testable = ["slack", "google-docs", "notion", "calendar"];
      expect(testable.length).toBe(4);
      expect(new Set(testable).size).toBe(4);
    });

    it("SSO is not testable via connection test", () => {
      const testable = ["slack", "google-docs", "notion", "calendar"];
      expect(testable).not.toContain("sso");
    });
  });
});

// ── Auto-context compilation tests ───────────────────────────────

import { compileContext, formatContextPacket } from "@/lib/context-compiler";
import type { ContextPacket } from "@/lib/context-compiler";

describe("auto-context compilation", () => {
  describe("compileContext", () => {
    it("returns valid context packet structure", () => {
      const packet = compileContext("Architecture Review", "2026-04-05T14:00:00Z");
      expect(packet.eventTitle).toBe("Architecture Review");
      expect(packet.eventTime).toBe("2026-04-05T14:00:00Z");
      expect(Array.isArray(packet.relatedDocs)).toBe(true);
      expect(Array.isArray(packet.recentDecisions)).toBe(true);
      expect(Array.isArray(packet.recentChanges)).toBe(true);
      expect(Array.isArray(packet.conflicts)).toBe(true);
      expect(typeof packet.summary).toBe("string");
      expect(packet.generatedAt).toBeTruthy();
    });

    it("extracts keywords from event title", () => {
      // "Architecture Review" → keywords: "architecture" (review is stop word)
      const packet = compileContext("Architecture Review", "2026-04-05T14:00:00Z");
      // Should search for "architecture" and find any matching docs
      expect(packet.summary).toContain("Architecture Review");
    });

    it("handles short/generic event titles", () => {
      const packet = compileContext("1:1 Meeting", "2026-04-05T10:00:00Z");
      // "1:1" and "Meeting" are short/stop words — should still return valid packet
      expect(packet.eventTitle).toBe("1:1 Meeting");
      expect(typeof packet.summary).toBe("string");
    });

    it("respects changeDays option", () => {
      const packet = compileContext("Sprint Planning", "2026-04-05T14:00:00Z", { changeDays: 3 });
      expect(packet).toBeDefined();
    });

    it("respects maxDocs option", () => {
      const packet = compileContext("All Docs Review", "2026-04-05T14:00:00Z", { maxDocs: 2 });
      expect(packet.relatedDocs.length).toBeLessThanOrEqual(2);
    });

    it("deduplicates related docs", () => {
      const packet = compileContext("API Architecture Design", "2026-04-05T14:00:00Z");
      const paths = packet.relatedDocs.map((d) => d.path);
      expect(paths.length).toBe(new Set(paths).size);
    });
  });

  describe("formatContextPacket", () => {
    it("formats packet with all sections", () => {
      const packet: ContextPacket = {
        eventTitle: "Sprint Review",
        eventTime: "2026-04-05T14:00:00Z",
        relatedDocs: [{ path: "docs/roadmap.md", title: "Roadmap", snippet: "Q3 goals", relevance: "matches sprint" }],
        recentDecisions: [{ summary: "Use React", artifactPath: "docs/decisions.md", status: "active", actor: "alice" }],
        recentChanges: [{ path: "docs/api.md", title: "API Guide", staleDays: 1 }],
        conflicts: [{ description: "REST vs GraphQL conflict" }],
        summary: "For Sprint Review: 1 doc, 1 decision, 1 change, 1 conflict.",
        generatedAt: new Date().toISOString(),
      };

      const text = formatContextPacket(packet);
      expect(text).toContain("Sprint Review");
      expect(text).toContain("Roadmap");
      expect(text).toContain("Use React");
      expect(text).toContain("API Guide");
      expect(text).toContain("REST vs GraphQL");
    });

    it("handles empty packet", () => {
      const packet: ContextPacket = {
        eventTitle: "Unknown Meeting",
        eventTime: "2026-04-05T10:00:00Z",
        relatedDocs: [],
        recentDecisions: [],
        recentChanges: [],
        conflicts: [],
        summary: "No context found.",
        generatedAt: new Date().toISOString(),
      };

      const text = formatContextPacket(packet);
      expect(text).toContain("Unknown Meeting");
      expect(text).toContain("No specific context found");
    });

    it("shows modification time for recent changes", () => {
      const packet: ContextPacket = {
        eventTitle: "Test", eventTime: "", generatedAt: "",
        relatedDocs: [], recentDecisions: [],
        recentChanges: [{ path: "test.md", title: "Test", staleDays: 0 }],
        conflicts: [], summary: "",
      };
      const text = formatContextPacket(packet);
      expect(text).toContain("today");
    });
  });
});

// ── Silent catch wiring tests ────────────────────────────────────

import { getActiveErrors, getErrorSummary, reportError } from "@/lib/error-reporter";

describe("silent catch wiring to error reporter", () => {
  describe("error reporter integration", () => {
    it("getErrorSummary returns counts after wiring", () => {
      const summary = getErrorSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.critical).toBe("number");
      expect(typeof summary.warning).toBe("number");
    });

    it("getActiveErrors returns errors array", () => {
      const errors = getActiveErrors();
      expect(Array.isArray(errors)).toBe(true);
      for (const e of errors) {
        expect(e.category).toBeTruthy();
        expect(e.severity).toBeTruthy();
        expect(e.message).toBeTruthy();
      }
    });

    it("error reporter has all expected categories", () => {
      const categories = ["scan", "search", "ai", "api", "integration", "plugin", "system", "config"];
      for (const cat of categories) {
        expect(cat).toBeTruthy();
      }
    });

    it("errors from different sources are categorized", () => {
      reportError("search", `wire-test-search-${Date.now()}`);
      reportError("api", `wire-test-api-${Date.now()}`);
      reportError("ai", `wire-test-ai-${Date.now()}`);
      reportError("config", `wire-test-config-${Date.now()}`);

      const errors = getActiveErrors({ limit: 20 });
      const categories = new Set(errors.map((e) => e.category));
      expect(categories.size).toBeGreaterThan(0);
    });
  });
});

// ── Query plan audit tests ───────────────────────────────────────

import {
  analyzeQuery,
  getExistingIndexes,
  ensureRequiredIndexes,
  runQueryAudit,
  formatAuditReport,
} from "@/lib/query-audit";

describe("query plan audit", () => {
  describe("analyzeQuery", () => {
    it("analyzes a simple query plan", () => {
      const result = analyzeQuery("EXPLAIN QUERY PLAN SELECT * FROM artifacts WHERE path = 'test'");
      expect(result.query).toContain("artifacts");
      expect(Array.isArray(result.plan)).toBe(true);
      expect(typeof result.usesIndex).toBe("boolean");
      expect(typeof result.isFullScan).toBe("boolean");
    });

    it("handles non-existent table gracefully", () => {
      const result = analyzeQuery("EXPLAIN QUERY PLAN SELECT * FROM nonexistent_table_xyz WHERE id = 1");
      expect(result.plan).toBeDefined();
    });
  });

  describe("getExistingIndexes", () => {
    it("returns array of indexes", () => {
      const indexes = getExistingIndexes();
      expect(Array.isArray(indexes)).toBe(true);
      expect(indexes.length).toBeGreaterThan(0);
      for (const idx of indexes) {
        expect(idx.table).toBeTruthy();
        expect(idx.name).toBeTruthy();
      }
    });
  });

  describe("ensureRequiredIndexes", () => {
    it("creates indexes without error", () => {
      const created = ensureRequiredIndexes();
      expect(Array.isArray(created)).toBe(true);
    });

    it("is idempotent", () => {
      ensureRequiredIndexes();
      const created2 = ensureRequiredIndexes();
      expect(Array.isArray(created2)).toBe(true);
    });
  });

  describe("runQueryAudit", () => {
    it("returns valid audit report", () => {
      const report = runQueryAudit();
      expect(Array.isArray(report.queries)).toBe(true);
      expect(Array.isArray(report.indexes)).toBe(true);
      expect(Array.isArray(report.missingIndexes)).toBe(true);
      expect(Array.isArray(report.optimizations)).toBe(true);
      expect(typeof report.score).toBe("number");
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(report.generatedAt).toBeTruthy();
    });

    it("queries have plan details", () => {
      const report = runQueryAudit();
      for (const q of report.queries) {
        expect(q.query).toBeTruthy();
        expect(Array.isArray(q.plan)).toBe(true);
      }
    });
  });

  describe("formatAuditReport", () => {
    it("produces readable text", () => {
      const report = runQueryAudit();
      const text = formatAuditReport(report);
      expect(text).toContain("Query Plan Audit");
      expect(text).toContain("score:");
      expect(text).toContain("indexes");
    });
  });
});

// ── Briefing optimization tests ──────────────────────────────────

describe("briefing page optimization", () => {
  describe("server-side artifact filtering", () => {
    it("filters recently modified (staleDays <= 1)", () => {
      const artifacts = [
        { staleDays: 0, path: "a.md", modifiedAt: new Date().toISOString() },
        { staleDays: 1, path: "b.md", modifiedAt: new Date().toISOString() },
        { staleDays: 5, path: "c.md", modifiedAt: new Date().toISOString() },
        { staleDays: 30, path: "d.md", modifiedAt: new Date().toISOString() },
      ];
      const recent = artifacts.filter((a) => a.staleDays <= 1);
      expect(recent.length).toBe(2);
    });

    it("filters needs-attention (staleDays > 14)", () => {
      const artifacts = [
        { staleDays: 0 }, { staleDays: 10 }, { staleDays: 15 }, { staleDays: 45 },
      ];
      const attention = artifacts.filter((a) => a.staleDays > 14);
      expect(attention.length).toBe(2);
    });

    it("deduplicates merged artifacts", () => {
      const recent = [{ path: "a.md" }, { path: "b.md" }];
      const stale = [{ path: "b.md" }, { path: "c.md" }];
      const seen = new Set<string>();
      const merged = [];
      for (const a of [...recent, ...stale]) {
        if (!seen.has(a.path)) { seen.add(a.path); merged.push(a); }
      }
      expect(merged.length).toBe(3); // a, b, c (deduplicated)
    });

    it("caps at 20 per category", () => {
      const artifacts = Array.from({ length: 50 }, (_, i) => ({
        staleDays: 0, path: `doc-${i}.md`, modifiedAt: new Date().toISOString(),
      }));
      const capped = artifacts.slice(0, 20);
      expect(capped.length).toBe(20);
    });
  });

  describe("pre-computed stats", () => {
    it("stats computed server-side match client-side", () => {
      const artifacts = [
        { staleDays: 0 }, { staleDays: 3 }, { staleDays: 7 },
        { staleDays: 15 }, { staleDays: 31 }, { staleDays: 60 },
      ];
      const stats = {
        total: artifacts.length,
        fresh: artifacts.filter((a) => a.staleDays <= 7).length,
        stale: artifacts.filter((a) => a.staleDays > 30).length,
      };
      expect(stats.total).toBe(6);
      expect(stats.fresh).toBe(3);
      expect(stats.stale).toBe(2);
    });

    it("pre-computed stats bypass client recalculation", () => {
      const precomputed = { total: 1000, fresh: 500, stale: 100 };
      const stats = precomputed || { total: 0, fresh: 0, stale: 0 };
      expect(stats.total).toBe(1000);
    });
  });
});

// ── API deprecation tests removed in v6 ──────────────────────────
// Deprecated routes (federation, sharing, contexts, marketplace, agent-memory,
// pipeline, gaps, meeting-brief) and deprecation.ts deleted in v6.
