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

// ── Vector math tests (for semantic search) ────────────────────────

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

describe("vector math (semantic search)", () => {
  it("identical vectors → 1", () => expect(cosineSim([1,2,3],[1,2,3])).toBeCloseTo(1,5));
  it("orthogonal → 0", () => expect(cosineSim([1,0,0],[0,1,0])).toBeCloseTo(0,5));
  it("opposite → -1", () => expect(cosineSim([1,0,0],[-1,0,0])).toBeCloseTo(-1,5));
  it("empty → 0", () => expect(cosineSim([],[])).toBe(0));
  it("mismatched dims → 0", () => expect(cosineSim([1,2],[1,2,3])).toBe(0));
  it("similar vectors → high", () => expect(cosineSim([0.1,0.2,0.3],[0.12,0.22,0.28])).toBeGreaterThan(0.99));
});

// ── Federation tests ───────────────────────────────────────────────

// ── Annotations tests ──────────────────────────────────────────────

import {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotationsForArtifact,
  getReplies,
  getAnnotation,
  getAnnotationCount,
  getRecentAnnotations,
  getAnnotatedArtifacts,
} from "@/lib/annotations";

describe("annotations", () => {
  describe("addAnnotation", () => {
    it("creates an annotation and returns its ID", () => {
      const id = addAnnotation({
        artifactPath: "ann/test.md",
        content: "This is a comment",
        author: "tester",
      });
      expect(id).toBeGreaterThan(0);

      const ann = getAnnotation(id);
      expect(ann).not.toBeNull();
      expect(ann!.content).toBe("This is a comment");
      expect(ann!.author).toBe("tester");
    });

    it("supports line range annotations", () => {
      const id = addAnnotation({
        artifactPath: "ann/lines.md",
        content: "Comment on lines 5-10",
        lineStart: 5,
        lineEnd: 10,
      });
      const ann = getAnnotation(id);
      expect(ann!.lineStart).toBe(5);
      expect(ann!.lineEnd).toBe(10);
    });

    it("supports threaded replies", () => {
      const parentId = addAnnotation({
        artifactPath: "ann/thread.md",
        content: "Parent comment",
      });
      const replyId = addAnnotation({
        artifactPath: "ann/thread.md",
        content: "Reply to parent",
        parentId,
      });

      const replies = getReplies(parentId);
      expect(replies.length).toBeGreaterThanOrEqual(1);
      expect(replies.some((r) => r.id === replyId)).toBe(true);
    });
  });

  describe("updateAnnotation", () => {
    it("updates content", () => {
      const id = addAnnotation({ artifactPath: "ann/update.md", content: "original" });
      updateAnnotation(id, "updated");
      expect(getAnnotation(id)!.content).toBe("updated");
    });
  });

  describe("deleteAnnotation", () => {
    it("removes annotation", () => {
      const id = addAnnotation({ artifactPath: "ann/delete.md", content: "temp" });
      deleteAnnotation(id);
      expect(getAnnotation(id)).toBeNull();
    });
  });

  describe("queries", () => {
    it("getAnnotationsForArtifact returns top-level only", () => {
      const path = `ann/query-${Date.now()}.md`;
      addAnnotation({ artifactPath: path, content: "top-level" });
      const anns = getAnnotationsForArtifact(path);
      expect(anns.length).toBeGreaterThanOrEqual(1);
      expect(anns.every((a) => a.parentId === null)).toBe(true);
    });

    it("getAnnotationCount returns count", () => {
      const path = `ann/count-${Date.now()}.md`;
      addAnnotation({ artifactPath: path, content: "one" });
      addAnnotation({ artifactPath: path, content: "two" });
      expect(getAnnotationCount(path)).toBe(2);
    });

    it("getRecentAnnotations returns array", () => {
      const recent = getRecentAnnotations(5);
      expect(Array.isArray(recent)).toBe(true);
    });

    it("getAnnotatedArtifacts returns paths with counts", () => {
      const artifacts = getAnnotatedArtifacts();
      expect(Array.isArray(artifacts)).toBe(true);
      if (artifacts.length > 0) {
        expect(artifacts[0].path).toBeTruthy();
        expect(artifacts[0].count).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

// ── Migration tests ────────────────────────────────────────────────

import {
  getCurrentVersion,
  getAppliedMigrations,
  getLatestVersion,
  getPendingMigrations,
  MIGRATIONS,
} from "@/lib/migrations";
import { getDb as getTestDb } from "@/lib/db";

describe("database migrations", () => {
  it("has at least 6 migrations", () => {
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(6);
  });

  it("migrations have sequential versions", () => {
    for (let i = 0; i < MIGRATIONS.length; i++) {
      expect(MIGRATIONS[i].version).toBe(i + 1);
    }
  });

  it("migrations have unique names", () => {
    const names = MIGRATIONS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("getCurrentVersion returns a number", () => {
    const db = getTestDb();
    const version = getCurrentVersion(db);
    expect(typeof version).toBe("number");
    expect(version).toBeGreaterThanOrEqual(0);
  });

  it("getAppliedMigrations returns array", () => {
    const db = getTestDb();
    const applied = getAppliedMigrations(db);
    expect(Array.isArray(applied)).toBe(true);
  });

  it("getLatestVersion matches last migration", () => {
    expect(getLatestVersion()).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
  });

  it("database is up to date after startup", () => {
    const db = getTestDb();
    const current = getCurrentVersion(db);
    expect(current).toBe(getLatestVersion());
    expect(getPendingMigrations(db)).toEqual([]);
  });
});

// ── Vector index tests ───────────────────────────────────────────

import {
  buildIndex,
  searchIndex,
  clearIndex,
  getIndexSize,
  isIndexStale,
  addToIndex,
  removeFromIndex,
  getIndexStats,
  vectorNorm,
  cosineSimilarityFast,
} from "@/lib/vector-index";

describe("vector index", () => {
  const dim = 4;

  // Helper: create a normalized embedding
  function vec(...values: number[]): number[] {
    return values;
  }

  beforeEach(() => {
    clearIndex();
  });

  describe("buildIndex", () => {
    it("loads embeddings and returns count", () => {
      const count = buildIndex([
        { path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) },
        { path: "b.md", chunkIndex: 0, embedding: vec(0, 1, 0, 0) },
      ]);
      expect(count).toBe(2);
      expect(getIndexSize()).toBe(2);
    });

    it("replaces previous index on rebuild", () => {
      buildIndex([{ path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) }]);
      expect(getIndexSize()).toBe(1);
      buildIndex([
        { path: "x.md", chunkIndex: 0, embedding: vec(0, 1, 0, 0) },
        { path: "y.md", chunkIndex: 0, embedding: vec(0, 0, 1, 0) },
      ]);
      expect(getIndexSize()).toBe(2);
    });
  });

  describe("vectorNorm", () => {
    it("computes correct L2 norm", () => {
      const n = vectorNorm(new Float32Array([3, 4]));
      expect(n).toBeCloseTo(5, 5);
    });

    it("returns 0 for zero vector", () => {
      expect(vectorNorm(new Float32Array([0, 0, 0]))).toBe(0);
    });
  });

  describe("cosineSimilarityFast", () => {
    it("returns 1 for identical vectors", () => {
      const a = new Float32Array([1, 2, 3]);
      const norm = vectorNorm(a);
      expect(cosineSimilarityFast(a, norm, a, norm)).toBeCloseTo(1, 5);
    });

    it("returns 0 for orthogonal vectors", () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([0, 1]);
      expect(cosineSimilarityFast(a, vectorNorm(a), b, vectorNorm(b))).toBeCloseTo(0, 5);
    });

    it("returns 0 for zero-norm vectors", () => {
      const a = new Float32Array([0, 0]);
      const b = new Float32Array([1, 1]);
      expect(cosineSimilarityFast(a, 0, b, vectorNorm(b))).toBe(0);
    });

    it("handles mismatched lengths gracefully", () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([1, 0, 0]);
      expect(cosineSimilarityFast(a, vectorNorm(a), b, vectorNorm(b))).toBe(0);
    });
  });

  describe("searchIndex", () => {
    beforeEach(() => {
      buildIndex([
        { path: "docs/arch.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) },
        { path: "docs/arch.md", chunkIndex: 1, embedding: vec(0.9, 0.1, 0, 0) },
        { path: "docs/pricing.md", chunkIndex: 0, embedding: vec(0, 1, 0, 0) },
        { path: "code/server.ts", chunkIndex: 0, embedding: vec(0, 0, 1, 0) },
        { path: "code/client.ts", chunkIndex: 0, embedding: vec(0, 0, 0, 1) },
      ]);
    });

    it("returns top-K results sorted by score", () => {
      const results = searchIndex(vec(1, 0, 0, 0), { topK: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
      expect(results[0].path).toBe("docs/arch.md");
      expect(results[0].score).toBeGreaterThan(results[results.length - 1].score);
    });

    it("deduplicates by path keeping highest score", () => {
      const results = searchIndex(vec(1, 0, 0, 0), { topK: 10 });
      const archResults = results.filter((r) => r.path === "docs/arch.md");
      expect(archResults.length).toBe(1);
      // Should keep chunkIndex 0 (exact match, score=1) not chunkIndex 1
      expect(archResults[0].chunkIndex).toBe(0);
    });

    it("filters by path prefix", () => {
      const results = searchIndex(vec(0.5, 0.5, 0.5, 0.5), { pathPrefix: "code/" });
      for (const r of results) expect(r.path.startsWith("code/")).toBe(true);
    });

    it("respects minScore threshold", () => {
      const results = searchIndex(vec(1, 0, 0, 0), { minScore: 0.5 });
      for (const r of results) expect(r.score).toBeGreaterThanOrEqual(0.5);
    });

    it("returns empty for zero query", () => {
      expect(searchIndex(vec(0, 0, 0, 0))).toEqual([]);
    });

    it("returns empty when index is empty", () => {
      clearIndex();
      expect(searchIndex(vec(1, 0, 0, 0))).toEqual([]);
    });
  });

  describe("addToIndex / removeFromIndex", () => {
    it("adds vectors incrementally", () => {
      buildIndex([{ path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) }]);
      addToIndex([{ path: "b.md", chunkIndex: 0, embedding: vec(0, 1, 0, 0) }]);
      expect(getIndexSize()).toBe(2);
    });

    it("removes vectors by path", () => {
      buildIndex([
        { path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) },
        { path: "a.md", chunkIndex: 1, embedding: vec(0.9, 0.1, 0, 0) },
        { path: "b.md", chunkIndex: 0, embedding: vec(0, 1, 0, 0) },
      ]);
      const removed = removeFromIndex("a.md");
      expect(removed).toBe(2);
      expect(getIndexSize()).toBe(1);
    });

    it("returns 0 when removing non-existent path", () => {
      buildIndex([{ path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) }]);
      expect(removeFromIndex("nonexistent.md")).toBe(0);
    });
  });

  describe("getIndexStats", () => {
    it("returns correct stats", () => {
      buildIndex([
        { path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) },
        { path: "a.md", chunkIndex: 1, embedding: vec(0, 1, 0, 0) },
        { path: "b.md", chunkIndex: 0, embedding: vec(0, 0, 1, 0) },
      ]);
      const stats = getIndexStats();
      expect(stats.vectorCount).toBe(3);
      expect(stats.uniquePaths).toBe(2);
      expect(stats.dimensions).toBe(4);
      expect(stats.builtAt).toBeGreaterThan(0);
      expect(stats.stale).toBe(false);
    });

    it("reports empty index", () => {
      const stats = getIndexStats();
      expect(stats.vectorCount).toBe(0);
      expect(stats.uniquePaths).toBe(0);
      expect(stats.dimensions).toBe(0);
    });
  });

  describe("isIndexStale / clearIndex", () => {
    it("new index is not stale", () => {
      buildIndex([{ path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) }]);
      expect(isIndexStale()).toBe(false);
    });

    it("cleared index is stale", () => {
      buildIndex([{ path: "a.md", chunkIndex: 0, embedding: vec(1, 0, 0, 0) }]);
      clearIndex();
      expect(isIndexStale()).toBe(true);
      expect(getIndexSize()).toBe(0);
    });
  });
});

// ── Review panel tests (review API used by artifact preview) ─────

import {
  createReviewRequest,
  updateReviewStatus,
  getReviewRequest,
  getReviewsForArtifact,
  getPendingReviews,
  getReviewCounts,
} from "@/lib/reviews";

describe("review panel", () => {
  describe("review request lifecycle", () => {
    it("creates a review and retrieves it for artifact panel", () => {
      const path = `panel/review-${Date.now()}.md`;
      const id = createReviewRequest({
        artifactPath: path,
        requestedBy: "alice",
        reviewer: "bob",
        message: "Please review my changes",
      });
      expect(id).toBeGreaterThan(0);

      const reviews = getReviewsForArtifact(path);
      expect(reviews.length).toBeGreaterThanOrEqual(1);
      const review = reviews.find((r) => r.id === id);
      expect(review).toBeDefined();
      expect(review!.status).toBe("pending");
      expect(review!.requestedBy).toBe("alice");
      expect(review!.reviewer).toBe("bob");
      expect(review!.message).toBe("Please review my changes");
    });

    it("approves a review from the panel", () => {
      const id = createReviewRequest({
        artifactPath: `panel/approve-${Date.now()}.md`,
        requestedBy: "alice",
        reviewer: "bob",
      });
      updateReviewStatus(id, "approved", "Looks good!");
      const review = getReviewRequest(id);
      expect(review!.status).toBe("approved");
      expect(review!.responseMessage).toBe("Looks good!");
    });

    it("requests changes from the panel", () => {
      const id = createReviewRequest({
        artifactPath: `panel/changes-${Date.now()}.md`,
        requestedBy: "alice",
        reviewer: "bob",
      });
      updateReviewStatus(id, "changes-requested", "Fix section 3");
      expect(getReviewRequest(id)!.status).toBe("changes-requested");
    });

    it("dismisses a review from the panel", () => {
      const id = createReviewRequest({
        artifactPath: `panel/dismiss-${Date.now()}.md`,
        requestedBy: "alice",
        reviewer: "bob",
      });
      updateReviewStatus(id, "dismissed");
      expect(getReviewRequest(id)!.status).toBe("dismissed");
    });
  });

  describe("pending reviews count for panel badge", () => {
    it("getPendingReviews returns only pending", () => {
      const pending = getPendingReviews();
      for (const r of pending) expect(r.status).toBe("pending");
    });

    it("getReviewCounts includes all statuses", () => {
      const counts = getReviewCounts();
      expect(typeof counts.pending).toBe("number");
      expect(typeof counts.approved).toBe("number");
      expect(typeof counts["changes-requested"]).toBe("number");
      expect(typeof counts.dismissed).toBe("number");
    });
  });

  describe("multiple reviews per artifact", () => {
    it("tracks multiple reviewers for same artifact", () => {
      const path = `panel/multi-${Date.now()}.md`;
      createReviewRequest({ artifactPath: path, requestedBy: "alice", reviewer: "bob" });
      createReviewRequest({ artifactPath: path, requestedBy: "alice", reviewer: "charlie" });
      const reviews = getReviewsForArtifact(path);
      expect(reviews.length).toBeGreaterThanOrEqual(2);
      const reviewers = reviews.map((r) => r.reviewer);
      expect(reviewers).toContain("bob");
      expect(reviewers).toContain("charlie");
    });
  });
});

// ── Annotation layer tests ───────────────────────────────────────

import {
  addAnnotation,
  getAnnotationsForArtifact,
  getReplies,
  getAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotationCount,
  getRecentAnnotations,
  getAnnotatedArtifacts,
} from "@/lib/annotations";

describe("annotation layer", () => {
  describe("create and retrieve", () => {
    it("adds an annotation and retrieves it", () => {
      const path = `ann/create-${Date.now()}.md`;
      const id = addAnnotation({
        artifactPath: path,
        author: "alice",
        content: "This section needs clarification.",
      });
      expect(id).toBeGreaterThan(0);

      const annotations = getAnnotationsForArtifact(path);
      expect(annotations.length).toBeGreaterThanOrEqual(1);
      const ann = annotations.find((a) => a.id === id);
      expect(ann).toBeDefined();
      expect(ann!.author).toBe("alice");
      expect(ann!.content).toBe("This section needs clarification.");
      expect(ann!.parentId).toBeNull();
    });

    it("supports line range annotations", () => {
      const path = `ann/lines-${Date.now()}.md`;
      const id = addAnnotation({
        artifactPath: path,
        content: "Typo on this line",
        lineStart: 15,
        lineEnd: 15,
      });
      const ann = getAnnotation(id);
      expect(ann).not.toBeNull();
      expect(ann!.lineStart).toBe(15);
      expect(ann!.lineEnd).toBe(15);
    });

    it("defaults author to anonymous", () => {
      const path = `ann/anon-${Date.now()}.md`;
      const id = addAnnotation({ artifactPath: path, content: "Anonymous note" });
      expect(getAnnotation(id)!.author).toBe("anonymous");
    });
  });

  describe("threading (replies)", () => {
    it("creates a reply to a parent annotation", () => {
      const path = `ann/thread-${Date.now()}.md`;
      const parentId = addAnnotation({ artifactPath: path, author: "alice", content: "Question?" });
      const replyId = addAnnotation({ artifactPath: path, author: "bob", content: "Answer.", parentId });

      const replies = getReplies(parentId);
      expect(replies.length).toBeGreaterThanOrEqual(1);
      expect(replies[0].author).toBe("bob");
      expect(replies[0].parentId).toBe(parentId);
    });

    it("top-level query excludes replies", () => {
      const path = `ann/toplevel-${Date.now()}.md`;
      const parentId = addAnnotation({ artifactPath: path, content: "Parent" });
      addAnnotation({ artifactPath: path, content: "Reply", parentId });

      const topLevel = getAnnotationsForArtifact(path);
      // Top-level only (parentId IS NULL)
      for (const a of topLevel) expect(a.parentId).toBeNull();
    });
  });

  describe("update and delete", () => {
    it("updates annotation content", () => {
      const id = addAnnotation({ artifactPath: "ann/update.md", content: "Original" });
      const updated = updateAnnotation(id, "Updated content");
      expect(updated).toBe(true);
      expect(getAnnotation(id)!.content).toBe("Updated content");
    });

    it("deletes an annotation", () => {
      const id = addAnnotation({ artifactPath: "ann/delete.md", content: "To delete" });
      expect(deleteAnnotation(id)).toBe(true);
      expect(getAnnotation(id)).toBeNull();
    });
  });

  describe("counts and aggregation", () => {
    it("getAnnotationCount returns count for path", () => {
      const path = `ann/count-${Date.now()}.md`;
      addAnnotation({ artifactPath: path, content: "One" });
      addAnnotation({ artifactPath: path, content: "Two" });
      expect(getAnnotationCount(path)).toBeGreaterThanOrEqual(2);
    });

    it("getRecentAnnotations returns array", () => {
      const recent = getRecentAnnotations(5);
      expect(Array.isArray(recent)).toBe(true);
      expect(recent.length).toBeLessThanOrEqual(5);
    });

    it("getAnnotatedArtifacts returns path-count pairs", () => {
      const artifacts = getAnnotatedArtifacts();
      expect(Array.isArray(artifacts)).toBe(true);
      for (const a of artifacts) {
        expect(typeof a.path).toBe("string");
        expect(typeof a.count).toBe("number");
      }
    });
  });
});

// ── Notification system tests ────────────────────────────────────

import {
  notify,
  notifyReviewUpdate,
  notifyAnnotation,
  notifyChange,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  pruneNotifications,
} from "@/lib/notifications";

describe("notification system", () => {
  describe("notify", () => {
    it("creates a notification", () => {
      const id = notify({
        recipient: "alice",
        type: "review",
        title: "Review approved",
        message: "Bob approved your review",
        artifactPath: "docs/auth.md",
      });
      expect(id).toBeGreaterThan(0);
    });

    it("retrieves notifications for recipient", () => {
      const recipient = `notif-get-${Date.now()}`;
      notify({ recipient, type: "review", title: "Test notification" });
      notify({ recipient, type: "annotation", title: "Another notification" });

      const notifs = getNotifications(recipient);
      expect(notifs.length).toBeGreaterThanOrEqual(2);
      for (const n of notifs) {
        expect(n.recipient).toBe(recipient);
        expect(n.read).toBe(false);
      }
    });
  });

  describe("notifyReviewUpdate", () => {
    it("creates review notification for requester", () => {
      const recipient = `review-notif-${Date.now()}`;
      const id = notifyReviewUpdate({
        requestedBy: recipient,
        reviewer: "bob",
        status: "approved",
        artifactPath: "docs/pricing.md",
        responseMessage: "Looks good!",
      });
      expect(id).toBeGreaterThan(0);

      const notifs = getNotifications(recipient);
      const found = notifs.find((n) => n.id === id);
      expect(found).toBeDefined();
      expect(found!.type).toBe("review");
      expect(found!.message).toContain("bob");
      expect(found!.message).toContain("approved");
      expect(found!.message).toContain("Looks good!");
    });
  });

  describe("notifyAnnotation", () => {
    it("creates annotation notification", () => {
      const recipient = `ann-notif-${Date.now()}`;
      const id = notifyAnnotation({
        recipient,
        author: "charlie",
        artifactPath: "docs/roadmap.md",
        content: "This section needs updating with Q3 data.",
      });
      expect(id).toBeGreaterThan(0);
      const notifs = getNotifications(recipient);
      expect(notifs.some((n) => n.type === "annotation")).toBe(true);
    });
  });

  describe("notifyChange", () => {
    it("creates change notification", () => {
      const recipient = `change-notif-${Date.now()}`;
      const id = notifyChange({
        recipient,
        artifactPath: "docs/api.md",
        changeSummary: "API endpoint for /users changed from REST to GraphQL.",
      });
      expect(id).toBeGreaterThan(0);
    });
  });

  describe("read/unread", () => {
    it("getUnreadCount returns count", () => {
      const recipient = `unread-${Date.now()}`;
      notify({ recipient, type: "system", title: "Unread 1" });
      notify({ recipient, type: "system", title: "Unread 2" });
      expect(getUnreadCount(recipient)).toBeGreaterThanOrEqual(2);
    });

    it("markRead marks a notification", () => {
      const recipient = `mark-${Date.now()}`;
      const id = notify({ recipient, type: "system", title: "To read" });
      expect(markRead(id)).toBe(true);

      const notifs = getNotifications(recipient, { unreadOnly: true });
      expect(notifs.find((n) => n.id === id)).toBeUndefined();
    });

    it("markAllRead marks all for recipient", () => {
      const recipient = `markall-${Date.now()}`;
      notify({ recipient, type: "system", title: "A" });
      notify({ recipient, type: "system", title: "B" });
      const marked = markAllRead(recipient);
      expect(marked).toBeGreaterThanOrEqual(2);
      expect(getUnreadCount(recipient)).toBe(0);
    });
  });

  describe("filtering", () => {
    it("filters by type", () => {
      const recipient = `filter-${Date.now()}`;
      notify({ recipient, type: "review", title: "R" });
      notify({ recipient, type: "annotation", title: "A" });

      const reviews = getNotifications(recipient, { type: "review" });
      for (const n of reviews) expect(n.type).toBe("review");
    });

    it("filters unread only", () => {
      const recipient = `unread-filter-${Date.now()}`;
      const id = notify({ recipient, type: "system", title: "Read this" });
      notify({ recipient, type: "system", title: "Keep unread" });
      markRead(id);

      const unread = getNotifications(recipient, { unreadOnly: true });
      for (const n of unread) expect(n.read).toBe(false);
    });
  });

  describe("pruneNotifications", () => {
    it("prunes without error", () => {
      const pruned = pruneNotifications(365);
      expect(typeof pruned).toBe("number");
    });
  });
});

// ── Notification inbox page tests ────────────────────────────────

describe("notification inbox", () => {
  describe("inbox data retrieval", () => {
    it("getNotifications returns all for recipient", () => {
      const recipient = `inbox-all-${Date.now()}`;
      notify({ recipient, type: "review", title: "R1" });
      notify({ recipient, type: "annotation", title: "A1" });
      const notifs = getNotifications(recipient);
      expect(notifs.length).toBeGreaterThanOrEqual(2);
    });

    it("getNotifications filters unread only", () => {
      const recipient = `inbox-unread-${Date.now()}`;
      const id = notify({ recipient, type: "system", title: "Read me" });
      notify({ recipient, type: "system", title: "Keep unread" });
      markRead(id);
      const unread = getNotifications(recipient, { unreadOnly: true });
      for (const n of unread) expect(n.read).toBe(false);
    });

    it("markAllRead clears unread count", () => {
      const recipient = `inbox-markall-${Date.now()}`;
      notify({ recipient, type: "system", title: "A" });
      notify({ recipient, type: "system", title: "B" });
      markAllRead(recipient);
      expect(getUnreadCount(recipient)).toBe(0);
    });
  });
});

// ── Vector index wired to hybrid search tests ────────────────────

import {
  buildIndex as buildVectorIndex,
  searchIndex as searchVectorIndex,
  clearIndex as clearVectorIndex,
  getIndexSize as getVectorIndexSize,
  isIndexStale as isVectorIndexStale,
} from "@/lib/vector-index";
import { getEmbeddingCount } from "@/lib/embeddings";

describe("vector index wired to search", () => {
  beforeEach(() => {
    clearVectorIndex();
  });

  describe("vector index integration with embeddings", () => {
    it("builds index from embedding-like data", () => {
      const embeddings = [
        { path: "vi/doc1.md", chunkIndex: 0, embedding: [1, 0, 0, 0] },
        { path: "vi/doc2.md", chunkIndex: 0, embedding: [0, 1, 0, 0] },
        { path: "vi/doc3.md", chunkIndex: 0, embedding: [0, 0, 1, 0] },
      ];
      const count = buildVectorIndex(embeddings);
      expect(count).toBe(3);
      expect(getVectorIndexSize()).toBe(3);
      expect(isVectorIndexStale()).toBe(false);
    });

    it("searches built index for similar vectors", () => {
      buildVectorIndex([
        { path: "vi/arch.md", chunkIndex: 0, embedding: [1, 0, 0, 0] },
        { path: "vi/pricing.md", chunkIndex: 0, embedding: [0, 1, 0, 0] },
        { path: "vi/roadmap.md", chunkIndex: 0, embedding: [0, 0, 1, 0] },
      ]);
      const results = searchVectorIndex([1, 0.1, 0, 0], { topK: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
      expect(results[0].path).toBe("vi/arch.md");
      expect(results[0].score).toBeGreaterThan(0.9);
    });

    it("respects minScore filter", () => {
      buildVectorIndex([
        { path: "vi/a.md", chunkIndex: 0, embedding: [1, 0, 0, 0] },
        { path: "vi/b.md", chunkIndex: 0, embedding: [0, 1, 0, 0] },
      ]);
      const results = searchVectorIndex([1, 0, 0, 0], { topK: 10, minScore: 0.5 });
      for (const r of results) expect(r.score).toBeGreaterThanOrEqual(0.5);
    });

    it("deduplicates by path (multiple chunks)", () => {
      buildVectorIndex([
        { path: "vi/doc.md", chunkIndex: 0, embedding: [1, 0, 0, 0] },
        { path: "vi/doc.md", chunkIndex: 1, embedding: [0.9, 0.1, 0, 0] },
      ]);
      const results = searchVectorIndex([1, 0, 0, 0], { topK: 10 });
      const docResults = results.filter((r) => r.path === "vi/doc.md");
      expect(docResults.length).toBe(1); // deduplicated
    });
  });

  describe("fallback when vector index empty", () => {
    it("getEmbeddingCount works for fallback detection", () => {
      const count = getEmbeddingCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("empty vector index triggers fallback path", () => {
      clearVectorIndex();
      expect(getVectorIndexSize()).toBe(0);
      expect(isVectorIndexStale()).toBe(true);
      // semanticSearch would fall through to inline cosine similarity
    });
  });

  describe("index lifecycle for search", () => {
    it("stale index triggers rebuild", () => {
      clearVectorIndex();
      expect(isVectorIndexStale()).toBe(true);

      // Rebuild
      buildVectorIndex([
        { path: "vi/fresh.md", chunkIndex: 0, embedding: [1, 0, 0, 0] },
      ]);
      expect(isVectorIndexStale()).toBe(false);
      expect(getVectorIndexSize()).toBe(1);
    });

    it("search returns empty for zero-vector query", () => {
      buildVectorIndex([
        { path: "vi/doc.md", chunkIndex: 0, embedding: [1, 0, 0, 0] },
      ]);
      const results = searchVectorIndex([0, 0, 0, 0]);
      expect(results).toEqual([]);
    });
  });
});
