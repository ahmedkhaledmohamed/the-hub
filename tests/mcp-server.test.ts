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
    it("finds artifacts by keyword", () => {
      const results = searchArtifacts("microservices");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].path).toBe("project/docs/architecture.md");
    });

    it("finds artifacts across multiple documents", () => {
      const results = searchArtifacts("Enterprise");
      expect(results.some((r) => r.path === "project/docs/pricing.md")).toBe(true);
    });

    it("respects limit parameter", () => {
      const results = searchArtifacts("project", 2);
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
    it("search → read: find and read a document", () => {
      // Step 1: Search for "roadmap"
      const results = searchArtifacts("roadmap");
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Step 2: Read the first result
      const content = getArtifactContent(results[0].path);
      expect(content).not.toBeNull();
      expect(content).toContain("Q2 2026 Roadmap");
    });

    it("search → read: find code file by content", () => {
      const results = searchArtifacts("express");
      expect(results.length).toBeGreaterThanOrEqual(1);

      const content = getArtifactContent(results[0].path);
      expect(content).toContain("app.listen");
    });
  });
});
