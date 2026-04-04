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
