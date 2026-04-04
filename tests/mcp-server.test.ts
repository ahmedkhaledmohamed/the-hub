import { describe, it, expect, beforeEach } from "vitest";
import { persistArtifacts, searchArtifacts, getArtifactContent, getArtifactCount } from "@/lib/db";
import type { Artifact } from "@/lib/types";

/**
 * Tests for the MCP server's underlying data layer.
 *
 * The MCP server itself is a stdio process that delegates to these
 * functions. We test the data layer directly since the MCP SDK
 * handles protocol serialization.
 */

function makeArtifact(overrides: Partial<Artifact>): Artifact {
  return {
    path: "ws/doc.md",
    title: "Document",
    type: "md",
    group: "docs",
    modifiedAt: new Date().toISOString(),
    size: 500,
    staleDays: 1,
    snippet: "A snippet.",
    ...overrides,
  };
}

describe("MCP server data layer", () => {
  beforeEach(() => {
    // Seed with workspace data the MCP tools will query
    const artifacts = [
      makeArtifact({
        path: "project/docs/architecture.md",
        title: "Architecture Overview",
        group: "docs",
        snippet: "System architecture document.",
      }),
      makeArtifact({
        path: "project/docs/pricing.md",
        title: "Pricing Strategy",
        group: "strategy",
        snippet: "Enterprise pricing tiers.",
      }),
      makeArtifact({
        path: "project/planning/roadmap.md",
        title: "Q2 Roadmap",
        group: "planning",
        snippet: "Quarterly goals and milestones.",
      }),
      makeArtifact({
        path: "project/src/server.ts",
        title: "Server",
        type: "code",
        group: "code",
        snippet: "Express server implementation.",
      }),
    ];

    const contentMap = new Map([
      ["project/docs/architecture.md", "# Architecture\n\nThe system uses microservices with gRPC.\n\n## Components\n\n- API Gateway\n- Auth Service\n- Data Pipeline"],
      ["project/docs/pricing.md", "# Pricing\n\nThree tiers: Free, Pro ($12/mo), Enterprise ($80/user).\n\nEnterprise includes SSO and audit logging."],
      ["project/planning/roadmap.md", "# Q2 2026 Roadmap\n\n## Goals\n\n1. Ship semantic search\n2. Launch plugin system\n3. Mobile PWA"],
      ["project/src/server.ts", "import express from 'express';\n\nconst app = express();\napp.listen(3000);"],
    ]);

    persistArtifacts(artifacts, contentMap, { deleteStale: false });
  });

  describe("search tool", () => {
    it("finds seeded artifacts by content", () => {
      // Re-seed to ensure data is present
      persistArtifacts([makeArtifact({
        path: "mcp-search/test.md",
        title: "MCP Search Test",
      })], new Map([
        ["mcp-search/test.md", "This document is about microservices and gRPC communication."],
      ]), { deleteStale: false });

      const results = searchArtifacts("microservices");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("respects limit parameter", () => {
      const results = searchArtifacts("document", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for no matches", () => {
      const results = searchArtifacts("xyznonexistent999");
      expect(results).toEqual([]);
    });
  });

  describe("read_artifact tool", () => {
    it("returns full content for existing artifact", () => {
      const content = getArtifactContent("project/docs/architecture.md");
      expect(content).not.toBeNull();
      expect(content).toContain("# Architecture");
      expect(content).toContain("gRPC");
      expect(content).toContain("Data Pipeline");
    });

    it("returns null for non-existent artifact", () => {
      const content = getArtifactContent("project/does-not-exist.md");
      expect(content).toBeNull();
    });
  });

  describe("list_groups / get_manifest tools", () => {
    it("artifact count reflects seeded data", () => {
      const count = getArtifactCount();
      expect(count).toBeGreaterThanOrEqual(4);
    });
  });

  describe("end-to-end workflow", () => {
    it("search then read: end-to-end", () => {
      // Seed a doc for this specific test
      persistArtifacts([makeArtifact({
        path: "mcp-e2e/roadmap.md",
        title: "E2E Roadmap",
      })], new Map([
        ["mcp-e2e/roadmap.md", "# Q2 2026 Roadmap\n\nShip semantic search."],
      ]), { deleteStale: false });

      const results = searchArtifacts("roadmap");
      expect(results.length).toBeGreaterThanOrEqual(1);

      const match = results.find((r) => r.path === "mcp-e2e/roadmap.md");
      if (match) {
        const content = getArtifactContent(match.path);
        expect(content).toContain("Q2 2026 Roadmap");
      }
    });
  });

  describe("new MCP tools (Phase 2+)", () => {
    it("askWorkspace returns result structure", async () => {
      const { askWorkspace } = await import("@/lib/rag");
      // With AI_PROVIDER=none, returns unavailable but correct structure
      process.env.AI_PROVIDER = "none";
      const result = await askWorkspace("test question");
      expect(typeof result.answer).toBe("string");
      expect(Array.isArray(result.sources)).toBe(true);
      expect(typeof result.model).toBe("string");
      delete process.env.AI_PROVIDER;
    });

    it("generate returns result structure", async () => {
      const { generate } = await import("@/lib/generator");
      process.env.AI_PROVIDER = "none";
      const result = await generate({ template: "status-update" });
      expect(typeof result.content).toBe("string");
      expect(result.template).toBe("status-update");
      expect(Array.isArray(result.sourcePaths)).toBe(true);
      delete process.env.AI_PROVIDER;
    });

    it("getTrends returns trend data", async () => {
      const { getTrends } = await import("@/lib/trends");
      const trends = getTrends(7);
      expect(Array.isArray(trends.dates)).toBe(true);
      expect(Array.isArray(trends.total)).toBe(true);
      expect(Array.isArray(trends.stale)).toBe(true);
    });

    it("analyzeHygiene returns report structure", async () => {
      const { analyzeHygiene } = await import("@/lib/hygiene-analyzer");
      const report = analyzeHygiene([], "2026-01-01");
      expect(Array.isArray(report.findings)).toBe(true);
      expect(typeof report.stats.totalFindings).toBe("number");
    });

    it("discoverRepos returns array", async () => {
      const { discoverRepos } = await import("@/lib/repo-scanner");
      const repos = discoverRepos([]);
      expect(Array.isArray(repos)).toBe(true);
    });
  });

  describe("MCP resources", () => {
    it("getArtifactContent returns content for indexed artifacts", () => {
      // Seed a resource-readable artifact
      persistArtifacts([makeArtifact({
        path: "mcp-res/doc.md",
        title: "Resource Doc",
      })], new Map([
        ["mcp-res/doc.md", "# Resource Test\n\nThis doc is readable as an MCP resource."],
      ]), { deleteStale: false });

      const content = getArtifactContent("mcp-res/doc.md");
      expect(content).toContain("Resource Test");
      expect(content).toContain("MCP resource");
    });

    it("getArtifactContent returns null for missing path", () => {
      expect(getArtifactContent("mcp-res/nonexistent.md")).toBeNull();
    });

    it("artifacts are listable for resource discovery", () => {
      const count = getArtifactCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Review request tests ───────────────────────────────────────────

import {
  createReviewRequest,
  updateReviewStatus,
  getReviewRequest,
  getReviewsForArtifact,
  getReviewsForReviewer,
  getPendingReviews,
  getReviewCounts,
} from "@/lib/reviews";

describe("review requests", () => {
  describe("createReviewRequest", () => {
    it("creates and retrieves a review", () => {
      const id = createReviewRequest({
        artifactPath: "review/doc.md",
        requestedBy: "alice",
        reviewer: "bob",
        message: "Please review my changes",
      });
      expect(id).toBeGreaterThan(0);

      const review = getReviewRequest(id);
      expect(review).not.toBeNull();
      expect(review!.status).toBe("pending");
      expect(review!.reviewer).toBe("bob");
      expect(review!.message).toBe("Please review my changes");
    });
  });

  describe("updateReviewStatus", () => {
    it("approves a review", () => {
      const id = createReviewRequest({ artifactPath: "review/approve.md", requestedBy: "a", reviewer: "b" });
      updateReviewStatus(id, "approved", "Looks good!");
      const review = getReviewRequest(id);
      expect(review!.status).toBe("approved");
      expect(review!.responseMessage).toBe("Looks good!");
    });

    it("requests changes", () => {
      const id = createReviewRequest({ artifactPath: "review/changes.md", requestedBy: "a", reviewer: "b" });
      updateReviewStatus(id, "changes-requested", "Fix section 3");
      expect(getReviewRequest(id)!.status).toBe("changes-requested");
    });
  });

  describe("queries", () => {
    it("getReviewsForArtifact returns reviews for a path", () => {
      const path = `review/query-${Date.now()}.md`;
      createReviewRequest({ artifactPath: path, requestedBy: "x", reviewer: "y" });
      const reviews = getReviewsForArtifact(path);
      expect(reviews.length).toBeGreaterThanOrEqual(1);
    });

    it("getReviewsForReviewer returns reviews for a person", () => {
      const reviewer = `reviewer-${Date.now()}`;
      createReviewRequest({ artifactPath: "review/person.md", requestedBy: "x", reviewer });
      const reviews = getReviewsForReviewer(reviewer);
      expect(reviews.length).toBeGreaterThanOrEqual(1);
    });

    it("getPendingReviews returns pending only", () => {
      const pending = getPendingReviews();
      expect(Array.isArray(pending)).toBe(true);
      for (const r of pending) expect(r.status).toBe("pending");
    });

    it("getReviewCounts returns counts by status", () => {
      const counts = getReviewCounts();
      expect(typeof counts.pending).toBe("number");
      expect(typeof counts.approved).toBe("number");
    });
  });
});
