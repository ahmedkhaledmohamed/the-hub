import { describe, it, expect } from "vitest";
import type {
  ChartPanelConfig,
  ChecklistPanelConfig,
  CustomPanelConfig,
  PanelConfig,
} from "@/lib/types";

/**
 * Tests for the new panel type configurations.
 *
 * Since the panel components are React client components that require
 * a browser/DOM environment, we test the type system and config
 * validation. Component rendering is verified via the build (Next.js
 * TypeScript checks) and manual testing.
 */

describe("panel types", () => {
  describe("ChartPanelConfig", () => {
    it("accepts valid chart config", () => {
      const config: ChartPanelConfig = {
        type: "chart",
        title: "Weekly Metrics",
        series: [
          { label: "Artifacts", data: [10, 12, 15, 14, 18, 20, 22], color: "#3b82f6" },
          { label: "Stale", data: [5, 4, 6, 3, 2, 3, 1], color: "#ef4444" },
        ],
      };

      expect(config.type).toBe("chart");
      expect(config.series.length).toBe(2);
      expect(config.series[0].data.length).toBe(7);
    });

    it("accepts chart config with badge and height", () => {
      const config: ChartPanelConfig = {
        type: "chart",
        title: "Trends",
        badge: { text: "Live", color: "green" },
        series: [{ label: "Count", data: [1, 2, 3] }],
        height: 50,
      };

      expect(config.badge?.text).toBe("Live");
      expect(config.height).toBe(50);
    });

    it("supports series without explicit color", () => {
      const config: ChartPanelConfig = {
        type: "chart",
        title: "Simple",
        series: [{ label: "Values", data: [100, 200, 150] }],
      };

      expect(config.series[0].color).toBeUndefined();
    });

    it("is assignable to PanelConfig", () => {
      const config: PanelConfig = {
        type: "chart",
        title: "Test",
        series: [{ label: "A", data: [1, 2] }],
      };

      expect(config.type).toBe("chart");
    });
  });

  describe("ChecklistPanelConfig", () => {
    it("accepts valid checklist config", () => {
      const config: ChecklistPanelConfig = {
        type: "checklist",
        title: "Sprint Ceremony",
        items: [
          { id: "standup", label: "Daily standup" },
          { id: "retro", label: "Sprint retro", description: "End of sprint" },
          { id: "planning", label: "Sprint planning" },
        ],
      };

      expect(config.type).toBe("checklist");
      expect(config.items.length).toBe(3);
      expect(config.items[1].description).toBe("End of sprint");
    });

    it("accepts persistKey for localStorage isolation", () => {
      const config: ChecklistPanelConfig = {
        type: "checklist",
        title: "Launch Checklist",
        persistKey: "launch-v2",
        items: [
          { id: "tests", label: "All tests passing" },
          { id: "docs", label: "Docs updated" },
        ],
      };

      expect(config.persistKey).toBe("launch-v2");
    });

    it("accepts badge", () => {
      const config: ChecklistPanelConfig = {
        type: "checklist",
        title: "Weekly",
        badge: { text: "3/5", color: "orange" },
        items: [{ id: "a", label: "Task A" }],
      };

      expect(config.badge?.text).toBe("3/5");
    });

    it("is assignable to PanelConfig", () => {
      const config: PanelConfig = {
        type: "checklist",
        title: "Test",
        items: [{ id: "x", label: "X" }],
      };

      expect(config.type).toBe("checklist");
    });
  });

  describe("CustomPanelConfig", () => {
    it("accepts URL-based custom panel", () => {
      const config: CustomPanelConfig = {
        type: "custom",
        title: "External Widget",
        url: "https://example.com/widget",
        height: 300,
      };

      expect(config.type).toBe("custom");
      expect(config.url).toBe("https://example.com/widget");
    });

    it("accepts markdown-based custom panel", () => {
      const config: CustomPanelConfig = {
        type: "custom",
        title: "Quick Reference",
        markdown: "## Shortcuts\n\n- `Cmd+K` — Search\n- `Cmd+.` — Notes\n- `?` — Help",
      };

      expect(config.markdown).toContain("Cmd+K");
    });

    it("accepts badge", () => {
      const config: CustomPanelConfig = {
        type: "custom",
        title: "Info",
        badge: { text: "New", color: "blue" },
        markdown: "Hello world",
      };

      expect(config.badge?.text).toBe("New");
    });

    it("is assignable to PanelConfig", () => {
      const config: PanelConfig = {
        type: "custom",
        title: "Test",
        markdown: "# Hello",
      };

      expect(config.type).toBe("custom");
    });
  });

  describe("PanelConfig union", () => {
    it("includes all 10 panel types", () => {
      const configs: PanelConfig[] = [
        { type: "timeline", title: "T", items: [] },
        { type: "links", title: "L", items: [] },
        { type: "tools", title: "T", items: [] },
        { type: "url", title: "U", url: "https://example.com" },
        { type: "markdown", title: "M", file: "readme.md" },
        { type: "embed", title: "E", url: "https://example.com" },
        { type: "health", title: "H" },
        { type: "chart", title: "C", series: [] },
        { type: "checklist", title: "CL", items: [] },
        { type: "custom", title: "CU" },
      ];

      const types = configs.map((c) => c.type);
      expect(types).toEqual([
        "timeline", "links", "tools", "url", "markdown",
        "embed", "health", "chart", "checklist", "custom",
      ]);
    });
  });
});
