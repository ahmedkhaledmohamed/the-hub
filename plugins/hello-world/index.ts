/**
 * Hello World plugin — example Hub plugin.
 *
 * Demonstrates:
 * - Contributing a custom panel via onRender
 * - Contributing virtual artifacts via onScan
 * - Extending search results via onSearch
 */

import type { HubPlugin, Artifact, PanelConfig, Manifest } from "../../src/lib/types";

const plugin: HubPlugin = {
  name: "hello-world",
  version: "1.0.0",
  description: "Example plugin that adds a welcome panel and virtual artifact",

  onInit() {
    console.log("[hello-world] Plugin initialized!");
  },

  onRender(): PanelConfig[] {
    return [
      {
        type: "custom",
        title: "Hello from Plugin",
        badge: { text: "Plugin", color: "purple" },
        markdown: "### Welcome!\n\nThis panel is rendered by the **hello-world** plugin.\n\n- Plugins live in `plugins/`\n- Each exports a `HubPlugin` object\n- They can add panels, artifacts, and extend search",
      },
    ];
  },

  onScan(manifest: Manifest): Artifact[] {
    // Contribute a virtual artifact that appears in the artifact list
    return [
      {
        path: "plugin:hello-world/welcome",
        title: "Hello World (Plugin)",
        type: "md",
        group: "other",
        modifiedAt: new Date().toISOString(),
        size: 0,
        staleDays: 0,
        snippet: "This is a virtual artifact contributed by the hello-world plugin.",
      },
    ];
  },

  onSearch(query: string, results: Artifact[]): Artifact[] {
    // Add a result if the query mentions "hello" or "plugin"
    if (query.toLowerCase().includes("hello") || query.toLowerCase().includes("plugin")) {
      return [
        {
          path: "plugin:hello-world/welcome",
          title: "Hello World (Plugin)",
          type: "md",
          group: "other",
          modifiedAt: new Date().toISOString(),
          size: 0,
          staleDays: 0,
          snippet: "Virtual artifact from the hello-world plugin.",
        },
      ];
    }
    return [];
  },

  onDestroy() {
    console.log("[hello-world] Plugin destroyed.");
  },
};

export default plugin;
