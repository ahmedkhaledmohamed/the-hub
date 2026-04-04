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
