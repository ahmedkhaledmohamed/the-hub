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
      const unique = Date.now().toString();
      trackOpen(`activity/popular-${unique}.md`);
      trackOpen(`activity/popular-${unique}.md`);
      trackOpen(`activity/popular-${unique}.md`);
      trackOpen(`activity/rare-${unique}.md`);

      const top = getTopOpened(7, 50);
      const popular = top.find((t) => t.path === `activity/popular-${unique}.md`);
      const rare = top.find((t) => t.path === `activity/rare-${unique}.md`);
      expect(popular).toBeDefined();
      expect(popular!.count).toBeGreaterThan(rare?.count || 0);
    });

    it("getTotalOpens counts all opens", () => {
      const before = getTotalOpens(1);
      trackOpen("activity/total-test.md");
      expect(getTotalOpens(1)).toBe(before + 1);
    });
  });

  describe("search tracking", () => {
    it("tracks searches and detects gaps", () => {
      const unique = `gap-query-${Date.now()}`;
      trackSearch(unique, 0); // 0 results = gap
      trackSearch(unique, 0);

      const gaps = getSearchGaps(1, 10);
      const found = gaps.find((g) => g.query === unique);
      expect(found).toBeDefined();
      expect(found!.searchCount).toBe(2);
    });

    it("tracks popular searches", () => {
      const unique = `popular-${Date.now()}`;
      trackSearch(unique, 5);
      trackSearch(unique, 5);

      const popular = getPopularSearches(1, 10);
      expect(popular.some((p) => p.query === unique)).toBe(true);
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
