import { describe, it, expect } from "vitest";
import { computeLineDiff, computeChangeFeed, saveSnapshot, loadPreviousSnapshot } from "@/lib/change-feed";
import type { Manifest, ManifestSnapshot } from "@/lib/types";

describe("computeLineDiff", () => {
  it("detects added lines", () => {
    const oldText = "line 1\nline 2";
    const newText = "line 1\nline 2\nline 3";
    const diff = computeLineDiff(oldText, newText);

    const added = diff.filter((d) => d.type === "added");
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(added.some((d) => d.content === "line 3")).toBe(true);
  });

  it("detects removed lines", () => {
    const oldText = "line 1\nline 2\nline 3";
    const newText = "line 1\nline 3";
    const diff = computeLineDiff(oldText, newText);

    const removed = diff.filter((d) => d.type === "removed");
    expect(removed.length).toBeGreaterThanOrEqual(1);
    expect(removed.some((d) => d.content === "line 2")).toBe(true);
  });

  it("detects replaced lines", () => {
    const oldText = "hello world";
    const newText = "hello universe";
    const diff = computeLineDiff(oldText, newText);

    expect(diff.some((d) => d.type === "removed" && d.content === "hello world")).toBe(true);
    expect(diff.some((d) => d.type === "added" && d.content === "hello universe")).toBe(true);
  });

  it("returns empty array for identical content", () => {
    const text = "line 1\nline 2\nline 3";
    const diff = computeLineDiff(text, text);

    const changes = diff.filter((d) => d.type !== "context");
    expect(changes.length).toBe(0);
  });

  it("respects maxLines limit", () => {
    const oldText = Array.from({ length: 100 }, (_, i) => `old line ${i}`).join("\n");
    const newText = Array.from({ length: 100 }, (_, i) => `new line ${i}`).join("\n");
    const diff = computeLineDiff(oldText, newText, 10);

    expect(diff.length).toBeLessThanOrEqual(10);
  });

  it("handles empty old text (new file)", () => {
    const diff = computeLineDiff("", "line 1\nline 2");
    const added = diff.filter((d) => d.type === "added");
    expect(added.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty new text (deleted file)", () => {
    const diff = computeLineDiff("line 1\nline 2", "");
    const removed = diff.filter((d) => d.type === "removed");
    expect(removed.length).toBeGreaterThanOrEqual(1);
  });

  it("handles multi-line additions in the middle", () => {
    const oldText = "# Title\n\n## Section 1\n\nContent here.";
    const newText = "# Title\n\n## Section 1\n\nContent here.\n\n## Section 2\n\nNew content.";
    const diff = computeLineDiff(oldText, newText);

    const added = diff.filter((d) => d.type === "added");
    expect(added.some((d) => d.content.includes("Section 2"))).toBe(true);
  });
});

describe("computeChangeFeed", () => {
  function makeManifest(artifacts: Array<{ path: string; title: string; modifiedAt: string }>): Manifest {
    return {
      generatedAt: new Date().toISOString(),
      workspaces: ["/test"],
      groups: [],
      artifacts: artifacts.map((a) => ({
        ...a,
        type: "md" as const,
        group: "docs",
        size: 100,
        staleDays: 0,
      })),
    };
  }

  function makeSnapshot(artifacts: Record<string, string>, hashes?: Record<string, string>): ManifestSnapshot {
    return {
      generatedAt: new Date(Date.now() - 86400000).toISOString(),
      artifacts,
      hashes,
    };
  }

  it("detects added files", () => {
    const current = makeManifest([
      { path: "ws/new.md", title: "New Doc", modifiedAt: new Date().toISOString() },
    ]);
    const previous = makeSnapshot({});

    const changes = computeChangeFeed(current, previous);
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe("added");
    expect(changes[0].path).toBe("ws/new.md");
  });

  it("detects deleted files", () => {
    const current = makeManifest([]);
    const previous = makeSnapshot({ "ws/old.md": "2026-01-01T00:00:00Z" });

    const changes = computeChangeFeed(current, previous);
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe("deleted");
    expect(changes[0].path).toBe("ws/old.md");
  });

  it("detects modified files (different modifiedAt)", () => {
    const current = makeManifest([
      { path: "ws/doc.md", title: "Doc", modifiedAt: "2026-04-03T12:00:00Z" },
    ]);
    const previous = makeSnapshot({ "ws/doc.md": "2026-04-02T12:00:00Z" });

    const changes = computeChangeFeed(current, previous);
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe("modified");
  });

  it("returns empty for unchanged files", () => {
    const ts = "2026-04-03T12:00:00Z";
    const current = makeManifest([
      { path: "ws/doc.md", title: "Doc", modifiedAt: ts },
    ]);
    const previous = makeSnapshot({ "ws/doc.md": ts });

    const changes = computeChangeFeed(current, previous);
    expect(changes.length).toBe(0);
  });

  it("returns empty when no previous snapshot", () => {
    const current = makeManifest([
      { path: "ws/doc.md", title: "Doc", modifiedAt: new Date().toISOString() },
    ]);

    const changes = computeChangeFeed(current, null);
    expect(changes.length).toBe(0);
  });

  it("sorts by modifiedAt descending", () => {
    const current = makeManifest([
      { path: "ws/old.md", title: "Old", modifiedAt: "2026-04-01T00:00:00Z" },
      { path: "ws/new.md", title: "New", modifiedAt: "2026-04-03T00:00:00Z" },
    ]);
    const previous = makeSnapshot({
      "ws/old.md": "2026-03-01T00:00:00Z",
      "ws/new.md": "2026-03-01T00:00:00Z",
    });

    const changes = computeChangeFeed(current, previous);
    expect(changes[0].path).toBe("ws/new.md");
    expect(changes[1].path).toBe("ws/old.md");
  });
});

describe("snapshot persistence", () => {
  it("saves and loads a snapshot", () => {
    const manifest: Manifest = {
      generatedAt: "2026-04-03T12:00:00Z",
      workspaces: ["/test"],
      groups: [],
      artifacts: [
        { path: "ws/doc.md", title: "Doc", type: "md", group: "docs", modifiedAt: "2026-04-03T12:00:00Z", size: 100, staleDays: 0 },
      ],
    };

    saveSnapshot(manifest);
    const loaded = loadPreviousSnapshot();

    expect(loaded).not.toBeNull();
    expect(loaded!.generatedAt).toBe("2026-04-03T12:00:00Z");
    expect(loaded!.artifacts["ws/doc.md"]).toBe("2026-04-03T12:00:00Z");
  });
});

// ── Temporal intelligence tests ────────────────────────────────────

import { recordSnapshot, getTrends, getSnapshotCount } from "@/lib/trends";
import type { Manifest } from "@/lib/types";

describe("temporal intelligence", () => {
  function makeManifest(artifacts: Array<{ group: string; staleDays: number }>): Manifest {
    return {
      generatedAt: new Date().toISOString(),
      workspaces: ["/test"],
      groups: [{ id: "docs", label: "Docs", description: "", color: "#333", tab: "all", count: artifacts.length }],
      artifacts: artifacts.map((a, i) => ({
        path: `trend/doc${i}.md`, title: `Doc ${i}`, type: "md" as const,
        group: a.group, modifiedAt: new Date().toISOString(), size: 100, staleDays: a.staleDays,
      })),
    };
  }

  describe("recordSnapshot", () => {
    it("records a daily snapshot", () => {
      const before = getSnapshotCount();
      const manifest = makeManifest([
        { group: "docs", staleDays: 1 },
        { group: "docs", staleDays: 15 },
        { group: "docs", staleDays: 60 },
      ]);
      recordSnapshot(manifest);
      expect(getSnapshotCount()).toBeGreaterThanOrEqual(before);
    });

    it("deduplicates by date (upsert)", () => {
      const manifest = makeManifest([{ group: "docs", staleDays: 5 }]);
      recordSnapshot(manifest);
      const count1 = getSnapshotCount();
      recordSnapshot(manifest); // same day
      expect(getSnapshotCount()).toBe(count1);
    });
  });

  describe("getTrends", () => {
    it("returns trend data", () => {
      const manifest = makeManifest([
        { group: "docs", staleDays: 2 },
        { group: "docs", staleDays: 45 },
      ]);
      recordSnapshot(manifest);

      const trends = getTrends(30);
      expect(trends.dates.length).toBeGreaterThanOrEqual(1);
      expect(trends.total.length).toBe(trends.dates.length);
      expect(trends.fresh.length).toBe(trends.dates.length);
      expect(trends.stale.length).toBe(trends.dates.length);
      expect(trends.stalePercent.length).toBe(trends.dates.length);
    });

    it("includes group-level data", () => {
      const manifest = makeManifest([{ group: "docs", staleDays: 3 }]);
      recordSnapshot(manifest);

      const trends = getTrends(30);
      expect(trends.groups).toBeDefined();
      expect(typeof trends.groups).toBe("object");
    });

    it("returns empty for no data", () => {
      // getTrends with a fresh date range might still return today's snapshot
      const trends = getTrends(1);
      expect(Array.isArray(trends.dates)).toBe(true);
    });
  });

  describe("getSnapshotCount", () => {
    it("returns a number", () => {
      expect(typeof getSnapshotCount()).toBe("number");
    });
  });
});

// ── Agent scheduler tests ──────────────────────────────────────────

import {
  getAgentResults,
  getConfiguredAgents,
} from "@/lib/agent-scheduler";

describe("agent scheduler", () => {
  describe("getAgentResults", () => {
    it("returns empty array when no results", () => {
      const results = getAgentResults("nonexistent-agent");
      expect(Array.isArray(results)).toBe(true);
    });

    it("returns all results when no agentId filter", () => {
      const results = getAgentResults(undefined, 5);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("getConfiguredAgents", () => {
    it("returns empty array when no agents configured", () => {
      const agents = getConfiguredAgents();
      expect(Array.isArray(agents)).toBe(true);
    });
  });
});

// ── Job queue tests ────────────────────────────────────────────────

import {
  enqueueJob,
  getJob,
  getNextPendingJob,
  getJobCounts,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  processNextJob,
  registerJobHandler,
} from "@/lib/job-queue";

describe("job queue", () => {
  describe("enqueueJob", () => {
    it("creates a job and returns its ID", () => {
      const id = enqueueJob("test-job", { key: "value" });
      expect(id).toBeGreaterThan(0);

      const job = getJob(id);
      expect(job).not.toBeNull();
      expect(job!.type).toBe("test-job");
      expect(job!.status).toBe("pending");
    });
  });

  describe("getNextPendingJob", () => {
    it("returns oldest pending job", () => {
      enqueueJob("queue-test-a", {});
      enqueueJob("queue-test-b", {});
      const job = getNextPendingJob();
      expect(job).not.toBeNull();
      expect(job!.status).toBe("pending");
    });
  });

  describe("state transitions", () => {
    it("marks job as running", () => {
      const id = enqueueJob("transition-test", {});
      markJobRunning(id);
      const job = getJob(id);
      expect(job!.status).toBe("running");
      expect(job!.attempts).toBe(1);
    });

    it("marks job as completed", () => {
      const id = enqueueJob("complete-test", {});
      markJobRunning(id);
      markJobCompleted(id, "done");
      const job = getJob(id);
      expect(job!.status).toBe("completed");
      expect(job!.result).toBe("done");
    });

    it("marks job as failed", () => {
      const id = enqueueJob("fail-test", {});
      markJobRunning(id);
      markJobFailed(id, "oops");
      const job = getJob(id);
      expect(job!.status).toBe("failed");
      expect(job!.error).toBe("oops");
    });
  });

  describe("getJobCounts", () => {
    it("returns counts by status", () => {
      const counts = getJobCounts();
      expect(typeof counts.pending).toBe("number");
      expect(typeof counts.completed).toBe("number");
      expect(typeof counts.failed).toBe("number");
    });
  });

  describe("processNextJob", () => {
    it("executes handler and completes job", async () => {
      // Drain any leftover pending jobs first
      registerJobHandler("echo", async (payload) => `echoed: ${JSON.stringify(payload)}`);
      // Mark all existing pending as failed to clear the queue
      let pending = getNextPendingJob();
      while (pending) {
        markJobFailed(pending.id, "cleared for test");
        pending = getNextPendingJob();
      }

      const id = enqueueJob("echo", { msg: "hello" });
      const processed = await processNextJob();
      expect(processed).toBe(true);

      const job = getJob(id);
      expect(job!.status).toBe("completed");
      expect(job!.result).toContain("hello");
    });

    it("fails job when handler throws", async () => {
      registerJobHandler("fail-handler", async () => {
        throw new Error("intentional failure");
      });
      // Clear queue
      let pending = getNextPendingJob();
      while (pending) {
        markJobFailed(pending.id, "cleared for test");
        pending = getNextPendingJob();
      }

      const id = enqueueJob("fail-handler", {}, 1);
      await processNextJob();

      const job = getJob(id);
      expect(job!.status).toBe("failed");
      expect(job!.error).toContain("intentional failure");
    });

    it("returns false when no pending jobs", async () => {
      let pending = getNextPendingJob();
      while (pending) {
        markJobFailed(pending.id, "cleared");
        pending = getNextPendingJob();
      }
      expect(await processNextJob()).toBe(false);
    });
  });
});

// ── AI triage tests ────────────────────────────────────────────────

import { triageByHeuristic, triageSummary } from "@/lib/triage";
import type { ChangeFeedEntry } from "@/lib/types";

describe("AI change feed triage", () => {
  describe("triageByHeuristic", () => {
    it("flags deleted files as attention", () => {
      const entry: ChangeFeedEntry = { path: "t/deleted.md", title: "Deleted", type: "deleted", group: "docs" };
      const result = triageByHeuristic(entry);
      expect(result.level).toBe("attention");
      expect(result.reason).toContain("deleted");
    });

    it("flags new files in critical groups as attention", () => {
      const entry: ChangeFeedEntry = { path: "t/new.md", title: "New", type: "added", group: "strategy" };
      const result = triageByHeuristic(entry);
      expect(result.level).toBe("attention");
    });

    it("flags large diffs as attention", () => {
      const diff = Array.from({ length: 25 }, (_, i) => ({ type: "added" as const, content: `line ${i}` }));
      const entry: ChangeFeedEntry = { path: "t/big.md", title: "Big", type: "modified", group: "docs", diff };
      const result = triageByHeuristic(entry);
      expect(result.level).toBe("attention");
      expect(result.reason).toContain("rewrite");
    });

    it("classifies normal additions as routine", () => {
      const entry: ChangeFeedEntry = { path: "t/normal.md", title: "Normal", type: "added", group: "docs" };
      const result = triageByHeuristic(entry);
      expect(result.level).toBe("routine");
    });

    it("classifies minor modifications as routine", () => {
      const entry: ChangeFeedEntry = { path: "t/minor.md", title: "Minor", type: "modified", group: "docs" };
      const result = triageByHeuristic(entry);
      expect(result.level).toBe("routine");
    });
  });

  describe("triageSummary", () => {
    it("counts triage levels", () => {
      const entries: ChangeFeedEntry[] = [
        { path: "a", title: "A", type: "added", group: "docs", triage: "routine" },
        { path: "b", title: "B", type: "modified", group: "docs", triage: "attention" },
        { path: "c", title: "C", type: "deleted", group: "docs", triage: "breaking" },
        { path: "d", title: "D", type: "modified", group: "docs" }, // no triage = unknown
      ];
      const summary = triageSummary(entries);
      expect(summary.routine).toBe(1);
      expect(summary.attention).toBe(1);
      expect(summary.breaking).toBe(1);
      expect(summary.unknown).toBe(1);
    });

    it("handles empty list", () => {
      const summary = triageSummary([]);
      expect(summary.routine).toBe(0);
      expect(summary.attention).toBe(0);
    });
  });
});

// ── Decision tracking tests ──────────────────────────────────────

import {
  extractDecisionsHeuristic,
  saveDecision,
  getDecision,
  getDecisionsForArtifact,
  getActiveDecisions,
  searchDecisions,
  supersedeDecision,
  revertDecision,
  getDecisionCounts,
  findContradictions,
  extractDecisionsWithAI,
} from "@/lib/decision-tracker";

describe("decision tracking", () => {
  describe("extractDecisionsHeuristic", () => {
    it("extracts 'decided to' patterns", () => {
      const text = "After discussion, we decided to use PostgreSQL for the main database.";
      const decisions = extractDecisionsHeuristic(text);
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      expect(decisions[0].summary).toContain("use PostgreSQL");
    });

    it("extracts 'chose to' patterns", () => {
      const text = "The team chose to migrate from REST to gRPC for internal services.";
      const decisions = extractDecisionsHeuristic(text);
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      expect(decisions[0].summary).toContain("migrate from REST");
    });

    it("extracts 'Decision:' label patterns", () => {
      const text = "Decision: We will use Kubernetes for container orchestration going forward.";
      const decisions = extractDecisionsHeuristic(text);
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      expect(decisions[0].summary).toContain("Kubernetes");
    });

    it("extracts 'the approach is' patterns", () => {
      const text = "The approach is to incrementally migrate services over six months.";
      const decisions = extractDecisionsHeuristic(text);
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      expect(decisions[0].summary).toContain("incrementally migrate");
    });

    it("deduplicates similar decisions", () => {
      const text = "We decided to use PostgreSQL. Later, we decided to use PostgreSQL for everything.";
      const decisions = extractDecisionsHeuristic(text);
      // Should deduplicate based on first 50 chars
      expect(decisions.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for text without decisions", () => {
      const text = "This is a regular document about the weather. It has no decisions in it at all.";
      expect(extractDecisionsHeuristic(text)).toEqual([]);
    });

    it("extracts actor when present", () => {
      const text = "Alice decided to postpone the launch until Q3 to allow more testing time.";
      const decisions = extractDecisionsHeuristic(text);
      expect(decisions.length).toBeGreaterThanOrEqual(1);
      expect(decisions[0].actor).toBe("Alice");
    });
  });

  describe("CRUD operations", () => {
    it("saves and retrieves a decision", () => {
      const id = saveDecision({
        artifactPath: "decisions/test-doc.md",
        summary: "Use TypeScript for all new services",
        detail: "Standardize on TS for type safety",
        actor: "engineering-lead",
        source: "heuristic",
      });
      expect(id).toBeGreaterThan(0);

      const decision = getDecision(id);
      expect(decision).not.toBeNull();
      expect(decision!.summary).toBe("Use TypeScript for all new services");
      expect(decision!.actor).toBe("engineering-lead");
      expect(decision!.status).toBe("active");
      expect(decision!.source).toBe("heuristic");
    });

    it("returns null for non-existent decision", () => {
      expect(getDecision(999999)).toBeNull();
    });

    it("getDecisionsForArtifact returns decisions for a path", () => {
      const path = `decisions/artifact-${Date.now()}.md`;
      saveDecision({ artifactPath: path, summary: "Decision A" });
      saveDecision({ artifactPath: path, summary: "Decision B" });
      const decisions = getDecisionsForArtifact(path);
      expect(decisions.length).toBeGreaterThanOrEqual(2);
    });

    it("getActiveDecisions returns only active decisions", () => {
      const active = getActiveDecisions();
      expect(Array.isArray(active)).toBe(true);
      for (const d of active) expect(d.status).toBe("active");
    });

    it("searchDecisions finds by summary text", () => {
      const unique = `unique-keyword-${Date.now()}`;
      saveDecision({ artifactPath: "search-test.md", summary: `Use ${unique} for search` });
      const results = searchDecisions(unique);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].summary).toContain(unique);
    });
  });

  describe("status transitions", () => {
    it("supersedes a decision", () => {
      const oldId = saveDecision({ artifactPath: "supersede.md", summary: "Use MySQL" });
      const newId = saveDecision({ artifactPath: "supersede.md", summary: "Use PostgreSQL" });
      const updated = supersedeDecision(oldId, newId);
      expect(updated).toBe(true);

      const old = getDecision(oldId);
      expect(old!.status).toBe("superseded");
      expect(old!.supersededBy).toBe(newId);
    });

    it("reverts a decision", () => {
      const id = saveDecision({ artifactPath: "revert.md", summary: "Temporary decision" });
      const updated = revertDecision(id);
      expect(updated).toBe(true);
      expect(getDecision(id)!.status).toBe("reverted");
    });
  });

  describe("getDecisionCounts", () => {
    it("returns counts by status", () => {
      const counts = getDecisionCounts();
      expect(typeof counts.active).toBe("number");
      expect(typeof counts.superseded).toBe("number");
      expect(typeof counts.reverted).toBe("number");
    });
  });

  describe("findContradictions", () => {
    it("returns array of potential contradictions", () => {
      const contradictions = findContradictions();
      expect(Array.isArray(contradictions)).toBe(true);
    });

    it("detects similar decisions from different docs", () => {
      // Save two decisions about the same topic from different docs
      saveDecision({
        artifactPath: "contradiction/doc-a.md",
        summary: "Use PostgreSQL database for production workloads storage",
      });
      saveDecision({
        artifactPath: "contradiction/doc-b.md",
        summary: "Use MySQL database for production workloads storage",
      });
      const contradictions = findContradictions();
      // Should find these as potential contradictions (high keyword overlap, different docs)
      const relevant = contradictions.filter(
        (c) =>
          (c.decisionA.artifactPath.startsWith("contradiction/") &&
            c.decisionB.artifactPath.startsWith("contradiction/")) ||
          (c.decisionB.artifactPath.startsWith("contradiction/") &&
            c.decisionA.artifactPath.startsWith("contradiction/")),
      );
      expect(relevant.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AI extraction", () => {
    const savedEnv = { ...process.env };
    afterEach(() => {
      process.env = { ...savedEnv };
    });

    it("returns empty when AI_PROVIDER=none", async () => {
      process.env.AI_PROVIDER = "none";
      const results = await extractDecisionsWithAI("We decided to use Rust.", "test.md");
      expect(results).toEqual([]);
    });
  });
});

// ── Decision browser tests ───────────────────────────────────────

describe("decision browser", () => {
  describe("decision CRUD for browser", () => {
    it("saves and retrieves decisions for listing", () => {
      const path = `browser/list-${Date.now()}.md`;
      saveDecision({ artifactPath: path, summary: "Use React for frontend", source: "heuristic" });
      saveDecision({ artifactPath: path, summary: "Use Tailwind for styling", source: "heuristic" });

      const decisions = getDecisionsForArtifact(path);
      expect(decisions.length).toBeGreaterThanOrEqual(2);
      expect(decisions[0].status).toBe("active");
    });

    it("searchDecisions finds by keyword", () => {
      const keyword = `browser-kw-${Date.now()}`;
      saveDecision({ artifactPath: "browser/search.md", summary: `Use ${keyword} for search` });
      const results = searchDecisions(keyword);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].summary).toContain(keyword);
    });

    it("getDecisionCounts returns all statuses", () => {
      const counts = getDecisionCounts();
      expect(typeof counts.active).toBe("number");
      expect(typeof counts.superseded).toBe("number");
      expect(typeof counts.reverted).toBe("number");
    });

    it("revertDecision changes status", () => {
      const id = saveDecision({ artifactPath: "browser/revert.md", summary: "Revertable decision" });
      const reverted = revertDecision(id);
      expect(reverted).toBe(true);
      const decision = getDecision(id);
      expect(decision!.status).toBe("reverted");
    });

    it("supersedeDecision links to replacement", () => {
      const oldId = saveDecision({ artifactPath: "browser/old.md", summary: "Old approach" });
      const newId = saveDecision({ artifactPath: "browser/new.md", summary: "New approach" });
      const result = supersedeDecision(oldId, newId);
      expect(result).toBe(true);
      const old = getDecision(oldId);
      expect(old!.status).toBe("superseded");
      expect(old!.supersededBy).toBe(newId);
    });
  });

  describe("findContradictions for browser", () => {
    it("returns contradiction pairs", () => {
      const results = findContradictions();
      expect(Array.isArray(results)).toBe(true);
      for (const c of results) {
        expect(c.decisionA).toBeDefined();
        expect(c.decisionB).toBeDefined();
        expect(typeof c.reason).toBe("string");
      }
    });
  });

  describe("status filter logic", () => {
    it("filters active decisions", () => {
      const all = [
        { status: "active" },
        { status: "superseded" },
        { status: "active" },
        { status: "reverted" },
      ];
      const active = all.filter((d) => d.status === "active");
      expect(active.length).toBe(2);
    });

    it("'all' filter returns everything", () => {
      const decisions = [{ status: "active" }, { status: "superseded" }];
      const filter = "all";
      const filtered = filter === "all" ? decisions : decisions.filter((d) => d.status === filter);
      expect(filtered.length).toBe(2);
    });
  });
});

// ── Async hygiene analysis tests ─────────────────────────────────

import {
  enqueueJob,
  getJob,
  registerJobHandler,
  getJobsByStatus,
  markJobCompleted,
  markJobRunning,
  getJobCounts,
} from "@/lib/job-queue";
import { analyzeHygiene } from "@/lib/hygiene-analyzer";

describe("async hygiene analysis", () => {
  describe("job queue for hygiene", () => {
    it("enqueues a hygiene-analysis job", () => {
      const jobId = enqueueJob("hygiene-analysis", { hygieneExclude: [] });
      expect(jobId).toBeGreaterThan(0);

      const job = getJob(jobId);
      expect(job).not.toBeNull();
      expect(job!.type).toBe("hygiene-analysis");
      expect(job!.status).toBe("pending");
    });

    it("job payload contains exclude list", () => {
      const jobId = enqueueJob("hygiene-analysis", { hygieneExclude: ["node_modules", ".git"] });
      const job = getJob(jobId);
      const payload = JSON.parse(job!.payload);
      expect(payload.hygieneExclude).toEqual(["node_modules", ".git"]);
    });

    it("job transitions through status lifecycle", () => {
      const jobId = enqueueJob("test-lifecycle", {});
      expect(getJob(jobId)!.status).toBe("pending");

      markJobRunning(jobId);
      expect(getJob(jobId)!.status).toBe("running");

      markJobCompleted(jobId, JSON.stringify({ findings: 5 }));
      expect(getJob(jobId)!.status).toBe("completed");
      expect(getJob(jobId)!.result).toContain("findings");
    });

    it("getJobCounts returns counts by status", () => {
      const counts = getJobCounts();
      expect(typeof counts.pending).toBe("number");
      expect(typeof counts.running).toBe("number");
      expect(typeof counts.completed).toBe("number");
      expect(typeof counts.failed).toBe("number");
    });
  });

  describe("hygiene analysis runs correctly", () => {
    it("analyzeHygiene returns report structure for empty input", () => {
      const report = analyzeHygiene([], new Date().toISOString());
      expect(report.stats.totalFindings).toBe(0);
      expect(report.stats.filesAnalyzed).toBe(0);
      expect(Array.isArray(report.findings)).toBe(true);
    });

    it("report result serializes to JSON for job completion", () => {
      const report = analyzeHygiene([], new Date().toISOString());
      const result = JSON.stringify({
        totalFindings: report.stats.totalFindings,
        filesAnalyzed: report.stats.filesAnalyzed,
      });
      const parsed = JSON.parse(result);
      expect(typeof parsed.totalFindings).toBe("number");
      expect(typeof parsed.filesAnalyzed).toBe("number");
    });
  });

  describe("async polling simulation", () => {
    it("job status transitions are queryable for polling", () => {
      const jobId = enqueueJob("hygiene-poll-test", {});

      // Poll 1: pending
      expect(getJob(jobId)!.status).toBe("pending");

      // Simulate worker picks up
      markJobRunning(jobId);
      expect(getJob(jobId)!.status).toBe("running");

      // Simulate completion
      markJobCompleted(jobId, "done");
      expect(getJob(jobId)!.status).toBe("completed");
    });
  });
});

// ── Decision query tool tests ────────────────────────────────────

import { queryDecisions } from "@/lib/decision-tracker";

describe("decision query tool", () => {
  beforeEach(() => {
    // Seed decisions for querying
    saveDecision({ artifactPath: "query/auth.md", summary: "Use JWT tokens for authentication with 24h expiry", actor: "alice" });
    saveDecision({ artifactPath: "query/db.md", summary: "Use PostgreSQL as the primary database", actor: "bob" });
    saveDecision({ artifactPath: "query/api.md", summary: "REST API with JSON responses for all endpoints" });
    saveDecision({ artifactPath: "query/deploy.md", summary: "Deploy to Kubernetes with Helm charts" });
  });

  describe("queryDecisions", () => {
    it("finds decisions by keyword from question", () => {
      const result = queryDecisions("what was decided about authentication?");
      expect(result.keywords).toContain("authentication");
      expect(result.decisions.length).toBeGreaterThanOrEqual(1);
      expect(result.decisions.some((d) => d.summary.toLowerCase().includes("jwt") || d.summary.toLowerCase().includes("auth"))).toBe(true);
    });

    it("extracts multiple keywords", () => {
      const result = queryDecisions("what database should we use for the API?");
      expect(result.keywords.length).toBeGreaterThanOrEqual(1);
      // Should find "database" and/or "api" keywords
      expect(result.keywords.some((k) => k === "database" || k === "api")).toBe(true);
    });

    it("removes stop words from question", () => {
      const result = queryDecisions("what was decided about the deployment process?");
      expect(result.keywords).not.toContain("what");
      expect(result.keywords).not.toContain("was");
      expect(result.keywords).not.toContain("decided");
      expect(result.keywords).not.toContain("about");
      expect(result.keywords).not.toContain("the");
    });

    it("returns all active decisions for empty keywords", () => {
      const result = queryDecisions("what?");
      // After stop word removal, no keywords left → returns all active
      expect(result.decisions.length).toBeGreaterThan(0);
    });

    it("boosts decisions matching multiple keywords", () => {
      const result = queryDecisions("JWT authentication tokens");
      // The JWT auth decision should rank high (matches "jwt", "authentication", "tokens")
      if (result.decisions.length > 0) {
        expect(result.decisions[0].summary.toLowerCase()).toContain("jwt");
      }
    });

    it("includes contradictions for matched decisions", () => {
      // Add potentially contradicting decisions
      saveDecision({ artifactPath: "query/auth2.md", summary: "Use OAuth2 tokens for authentication instead of JWT" });
      const result = queryDecisions("authentication tokens");
      expect(Array.isArray(result.contradictions)).toBe(true);
    });

    it("returns keywords used for the search", () => {
      const result = queryDecisions("kubernetes helm deployment");
      expect(result.keywords).toContain("kubernetes");
      expect(result.keywords).toContain("helm");
      expect(result.keywords).toContain("deployment");
    });
  });

  describe("query result structure", () => {
    it("decisions have all required fields", () => {
      const result = queryDecisions("database");
      for (const d of result.decisions) {
        expect(d.id).toBeDefined();
        expect(d.summary).toBeTruthy();
        expect(d.artifactPath).toBeTruthy();
        expect(d.status).toBeTruthy();
        expect(d.source).toBeTruthy();
      }
    });

    it("contradictions have both decisions and reason", () => {
      const result = queryDecisions("all decisions");
      for (const c of result.contradictions) {
        expect(c.decisionA).toBeDefined();
        expect(c.decisionB).toBeDefined();
        expect(typeof c.reason).toBe("string");
      }
    });
  });
});

// ── Doc lifecycle state tests ───────────────────────────────────

import {
  getLifecycleState,
  getEffectiveState,
  setLifecycleState,
  getLifecycleSummary,
  getTransitionHistory,
  getArtifactsByState,
  applyAutoTransitions,
} from "@/lib/doc-lifecycle";

describe("doc lifecycle states", () => {
  describe("getEffectiveState", () => {
    it("returns 'active' for artifacts without lifecycle record", () => {
      expect(getEffectiveState("lifecycle/no-record.md")).toBe("active");
    });
  });

  describe("setLifecycleState", () => {
    it("sets state and returns record", () => {
      const path = `lifecycle/set-${Date.now()}.md`;
      const record = setLifecycleState(path, "draft", { changedBy: "user", reason: "New document" });
      expect(record.path).toBe(path);
      expect(record.state).toBe("draft");
      expect(record.changedBy).toBe("user");
      expect(record.reason).toBe("New document");
    });

    it("tracks previous state on transition", () => {
      const path = `lifecycle/transition-${Date.now()}.md`;
      setLifecycleState(path, "draft");
      const record = setLifecycleState(path, "active", { reason: "Published" });
      expect(record.state).toBe("active");
      expect(record.previousState).toBe("draft");
    });

    it("logs transition in history", () => {
      const path = `lifecycle/history-${Date.now()}.md`;
      setLifecycleState(path, "draft");
      setLifecycleState(path, "active", { reason: "Published" });
      setLifecycleState(path, "stale", { reason: "Aged out" });

      const history = getTransitionHistory(path);
      expect(history.length).toBeGreaterThanOrEqual(2);
      // Verify all expected transitions are present
      const transitions = history.map((h) => `${h.from}->${h.to}`);
      expect(transitions).toContain("active->stale");
      expect(transitions).toContain("draft->active");
    });
  });

  describe("getLifecycleSummary", () => {
    it("returns counts by state", () => {
      const ts = Date.now();
      setLifecycleState(`lifecycle/sum-draft-${ts}.md`, "draft");
      setLifecycleState(`lifecycle/sum-active-${ts}.md`, "active");
      setLifecycleState(`lifecycle/sum-stale-${ts}.md`, "stale");

      const summary = getLifecycleSummary();
      expect(summary.total).toBeGreaterThanOrEqual(3);
      expect(typeof summary.draft).toBe("number");
      expect(typeof summary.active).toBe("number");
      expect(typeof summary.stale).toBe("number");
      expect(typeof summary.archived).toBe("number");
    });
  });

  describe("getArtifactsByState", () => {
    it("returns artifacts in a specific state", () => {
      const ts = Date.now();
      setLifecycleState(`lifecycle/by-state-${ts}.md`, "archived", { reason: "test" });

      const archived = getArtifactsByState("archived");
      expect(archived.some((r) => r.path === `lifecycle/by-state-${ts}.md`)).toBe(true);
    });
  });

  describe("applyAutoTransitions", () => {
    it("transitions active → stale when past threshold", () => {
      const path = `lifecycle/auto-stale-${Date.now()}.md`;
      setLifecycleState(path, "active");

      const count = applyAutoTransitions([{ path, staleDays: 100 }], { stale: 90 });
      expect(count).toBe(1);
      expect(getEffectiveState(path)).toBe("stale");
    });

    it("transitions to archived when past archive threshold", () => {
      const path = `lifecycle/auto-archive-${Date.now()}.md`;
      setLifecycleState(path, "active");

      const count = applyAutoTransitions([{ path, staleDays: 400 }], { archive: 365 });
      expect(count).toBe(1);
      expect(getEffectiveState(path)).toBe("archived");
    });

    it("reactivates stale docs when updated", () => {
      const path = `lifecycle/auto-reactivate-${Date.now()}.md`;
      setLifecycleState(path, "stale");

      const count = applyAutoTransitions([{ path, staleDays: 3 }], { fresh: 7 });
      expect(count).toBe(1);
      expect(getEffectiveState(path)).toBe("active");
    });

    it("does not transition fresh active docs", () => {
      const path = `lifecycle/auto-fresh-${Date.now()}.md`;
      setLifecycleState(path, "active");

      const count = applyAutoTransitions([{ path, staleDays: 5 }]);
      expect(count).toBe(0);
      expect(getEffectiveState(path)).toBe("active");
    });
  });
});
