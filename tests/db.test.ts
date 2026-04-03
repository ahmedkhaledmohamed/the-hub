import { describe, it, expect, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join, resolve } from "path";
import {
  persistArtifacts,
  searchArtifacts,
  getArtifactContent,
  getArtifactCount,
  getUserState,
  setUserState,
  contentHash,
  closeDb,
} from "@/lib/db";
import type { Artifact } from "@/lib/types";

// Use a test-specific database by setting the working directory context
// The db module uses resolve(".hub-data") which is relative to cwd

const TEST_DB_DIR = resolve(".hub-data");

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    path: "test-workspace/docs/test-doc.md",
    title: "Test Document",
    type: "md",
    group: "docs",
    modifiedAt: new Date().toISOString(),
    size: 1234,
    staleDays: 5,
    snippet: "This is a test document about architecture patterns.",
    ...overrides,
  };
}

describe("db", () => {
  describe("contentHash", () => {
    it("produces consistent SHA-256 hashes", () => {
      const hash1 = contentHash("hello world");
      const hash2 = contentHash("hello world");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("produces different hashes for different content", () => {
      const hash1 = contentHash("hello");
      const hash2 = contentHash("world");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("persistArtifacts", () => {
    it("inserts artifacts into the database", () => {
      const artifact = makeArtifact();
      const contentMap = new Map([["test-workspace/docs/test-doc.md", "# Test\n\nFull document content here."]]);

      persistArtifacts([artifact], contentMap);

      expect(getArtifactCount()).toBeGreaterThanOrEqual(1);
    });

    it("upserts on conflict (same path)", () => {
      const artifact = makeArtifact({ title: "Original Title" });
      const contentMap = new Map([["test-workspace/docs/test-doc.md", "original content"]]);
      persistArtifacts([artifact], contentMap);

      const updated = makeArtifact({ title: "Updated Title" });
      const updatedContent = new Map([["test-workspace/docs/test-doc.md", "updated content"]]);
      persistArtifacts([updated], updatedContent);

      const content = getArtifactContent("test-workspace/docs/test-doc.md");
      expect(content).toBe("updated content");
    });

    it("removes artifacts that no longer exist in the scan", () => {
      const a1 = makeArtifact({ path: "ws/keep.md" });
      const a2 = makeArtifact({ path: "ws/remove.md" });
      const contentMap = new Map([
        ["ws/keep.md", "keep this"],
        ["ws/remove.md", "remove this"],
      ]);
      persistArtifacts([a1, a2], contentMap);

      // Second scan only has a1
      persistArtifacts([a1], new Map([["ws/keep.md", "keep this"]]));

      const removed = getArtifactContent("ws/remove.md");
      expect(removed).toBeNull();
    });
  });

  describe("searchArtifacts", () => {
    it("finds artifacts by content via FTS5", () => {
      const artifact = makeArtifact({
        path: "ws/architecture-guide.md",
        title: "Architecture Guide",
      });
      const contentMap = new Map([
        ["ws/architecture-guide.md", "This document describes the microservice architecture and deployment patterns."],
      ]);
      persistArtifacts([artifact], contentMap);

      const results = searchArtifacts("microservice");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.path === "ws/architecture-guide.md")).toBe(true);
    });

    it("finds artifacts by title", () => {
      const artifact = makeArtifact({
        path: "ws/pricing-strategy.md",
        title: "Pricing Strategy 2026",
      });
      persistArtifacts([artifact], new Map([["ws/pricing-strategy.md", "Enterprise pricing tiers."]]));

      const results = searchArtifacts("pricing");
      expect(results.some((r) => r.path === "ws/pricing-strategy.md")).toBe(true);
    });

    it("returns empty array for no matches", () => {
      const results = searchArtifacts("xyznonexistent12345");
      expect(results).toEqual([]);
    });

    it("handles invalid FTS syntax gracefully (falls back to LIKE)", () => {
      // FTS5 chokes on unbalanced quotes; our function should fall back
      const results = searchArtifacts('"unclosed');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("getArtifactContent", () => {
    it("returns content for existing artifacts", () => {
      const artifact = makeArtifact({ path: "ws/readme.md" });
      persistArtifacts([artifact], new Map([["ws/readme.md", "# README\n\nHello world."]]));

      const content = getArtifactContent("ws/readme.md");
      expect(content).toBe("# README\n\nHello world.");
    });

    it("returns null for non-existent artifacts", () => {
      const content = getArtifactContent("ws/does-not-exist.md");
      expect(content).toBeNull();
    });
  });

  describe("user state", () => {
    it("sets and gets user state", () => {
      setUserState("test-key", JSON.stringify({ pinned: ["doc-a", "doc-b"] }));
      const value = getUserState("test-key");
      expect(value).not.toBeNull();
      expect(JSON.parse(value!)).toEqual({ pinned: ["doc-a", "doc-b"] });
    });

    it("overwrites existing state", () => {
      setUserState("overwrite-key", "first");
      setUserState("overwrite-key", "second");
      expect(getUserState("overwrite-key")).toBe("second");
    });

    it("returns null for missing keys", () => {
      expect(getUserState("nonexistent-key")).toBeNull();
    });
  });
});
