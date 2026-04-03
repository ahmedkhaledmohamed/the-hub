/**
 * hub.config.ts — Your personal hub configuration.
 *
 * Copy this file to hub.config.ts and customize it for your workspace.
 * hub.config.ts is gitignored — your personal content stays local.
 */

import type { HubConfig } from "@/lib/types";

const config: HubConfig = {
  name: "My Hub",
  port: 9001,

  // Optional: PM AI Partner Framework integration
  // framework: {
  //   path: "~/Developer/pm-ai-partner-framework",
  //   tab: "ai-tools",  // which tab to show framework data on
  // },

  // Directories to scan for artifacts
  workspaces: [
    { path: "~/Developer/my-project", label: "My Project" },
  ],

  // How scanned files are grouped — first match wins
  groups: [
    {
      id: "docs",
      label: "Documentation",
      description: "Project documentation and guides",
      match: "my-project/docs/**",
      tab: "knowledge",
      color: "#4a9eff",
    },
    {
      id: "presentations",
      label: "Presentations",
      description: "Slide decks and briefs",
      match: ["my-project/presentations/**", "my-project/site/presentations/**"],
      tab: "deliverables",
      color: "#ff9940",
    },
    {
      id: "planning",
      label: "Planning",
      description: "Planning docs, roadmaps, and proposals",
      match: "my-project/planning/**",
      tab: "planning",
      color: "#3b82f6",
    },
  ],

  // Tab structure — each tab shows artifacts from its assigned groups
  tabs: [
    { id: "planning", label: "Planning", icon: "calendar", default: true },
    { id: "knowledge", label: "Knowledge", icon: "book-open" },
    { id: "deliverables", label: "Deliverables", icon: "package" },
    // "All" tab is always added automatically
  ],

  // Curated panels per tab — links, timelines, tools
  panels: {
    planning: [
      {
        type: "timeline",
        title: "Key Dates",
        badge: { text: "Live", color: "green" },
        items: [
          { date: "Jan 15", text: "Planning kickoff", status: "past" },
          { date: "Feb 1", text: "Submit proposals", status: "active" },
          { date: "Mar 1", text: "Final review", status: "" },
        ],
      },
      {
        type: "links",
        title: "Quick Links",
        items: [
          { label: "Project Board", url: "https://example.com/board", icon: "kanban", meta: "Board" },
          { label: "Team Slack", url: "https://example.slack.com/channel", icon: "message-circle", meta: "Chat" },
        ],
      },
    ],
    knowledge: [
      {
        type: "links",
        title: "Key Resources",
        items: [
          { label: "Architecture Overview", url: "/file/my-project/docs/architecture.md", icon: "file-text" },
          { label: "API Documentation", url: "https://example.com/api-docs", icon: "globe", external: true },
        ],
      },
    ],
  },

  // External tools shown in the Deliverables tab
  tools: [
    { label: "Project Dashboard", url: "https://example.com/dashboard", icon: "bar-chart", description: "Analytics" },
  ],
};

export default config;
