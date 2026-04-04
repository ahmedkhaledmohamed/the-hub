#!/usr/bin/env node

/**
 * The Hub MCP Server
 *
 * Exposes The Hub's indexed workspace as an MCP server over stdio.
 * AI tools (Claude Code, Cursor, etc.) can search, read, and browse
 * your workspace through this interface.
 *
 * Usage:
 *   node src/mcp/server.ts
 *   # or via the bin entry:
 *   npx hub-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";

// Set cwd to the hub root so db.ts resolves .hub-data correctly
const hubRoot = resolve(__dirname, "../..");
process.chdir(hubRoot);

// Lazy imports to ensure cwd is set before modules resolve paths
async function getDb() {
  const { searchArtifacts, getArtifactContent, getArtifactCount } = await import("../lib/db.js");
  return { searchArtifacts, getArtifactContent, getArtifactCount };
}

async function getManifestStore() {
  const { getManifest } = await import("../lib/manifest-store.js");
  return { getManifest };
}

async function main() {
  const server = new McpServer({
    name: "the-hub",
    version: "1.0.0",
  });

  // ── Tool: search ────────────────────────────────────────────────

  server.tool(
    "search",
    "Search The Hub's indexed workspace using full-text search. Returns ranked results with snippets.",
    {
      query: z.string().describe("Search query (supports FTS5 syntax: AND, OR, NOT, phrases)"),
      limit: z.number().optional().default(10).describe("Maximum number of results (default 10)"),
    },
    async ({ query, limit }) => {
      const db = await getDb();
      const results = db.searchArtifacts(query, limit);

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results found for "${query}".` }],
        };
      }

      const text = results
        .map((r, i) => `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet || "No preview available."}`)
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text: `Found ${results.length} result(s) for "${query}":\n\n${text}` }],
      };
    },
  );

  // ── Tool: read_artifact ─────────────────────────────────────────

  server.tool(
    "read_artifact",
    "Read the full content of an artifact by its path. Use search first to find the path.",
    {
      path: z.string().describe("Artifact path (e.g. 'my-project/docs/architecture.md')"),
    },
    async ({ path }) => {
      const db = await getDb();
      const content = db.getArtifactContent(path);

      if (content === null) {
        return {
          content: [{ type: "text" as const, text: `Artifact not found: "${path}". Use the search tool to find valid paths.` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: content }],
      };
    },
  );

  // ── Tool: list_groups ───────────────────────────────────────────

  server.tool(
    "list_groups",
    "List all artifact groups in the workspace with their counts and metadata.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      if (manifest.groups.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No groups found. The workspace may not be configured yet." }],
        };
      }

      const text = manifest.groups
        .map((g) => `- **${g.label}** (${g.id}): ${g.count} artifact(s) — ${g.description || "No description"}`)
        .join("\n");

      return {
        content: [{ type: "text" as const, text: `Workspace groups:\n\n${text}\n\nTotal: ${manifest.artifacts.length} artifacts across ${manifest.groups.length} groups.` }],
      };
    },
  );

  // ── Tool: get_manifest ──────────────────────────────────────────

  server.tool(
    "get_manifest",
    "Get the full workspace manifest including all artifacts, groups, and metadata. Use for an overview of the entire workspace.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      const summary = {
        generatedAt: manifest.generatedAt,
        workspaces: manifest.workspaces,
        groupCount: manifest.groups.length,
        artifactCount: manifest.artifacts.length,
        groups: manifest.groups.map((g) => ({
          id: g.id,
          label: g.label,
          count: g.count,
          tab: g.tab,
        })),
        artifacts: manifest.artifacts.map((a) => ({
          path: a.path,
          title: a.title,
          type: a.type,
          group: a.group,
          staleDays: a.staleDays,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  // ── Start server ────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[hub-mcp] Fatal error:", err);
  process.exit(1);
});
