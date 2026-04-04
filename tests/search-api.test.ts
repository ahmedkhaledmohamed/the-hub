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
      const before = getLinkCount();
      addLink("graph/cnt1.md", "graph/cnt2.md", "supersedes");
      expect(getLinkCount()).toBeGreaterThanOrEqual(before + 1);
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
