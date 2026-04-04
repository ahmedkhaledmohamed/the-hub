#!/usr/bin/env node

/**
 * The Hub MCP Server (Full)
 *
 * Exposes The Hub's complete feature set as an MCP server over stdio.
 * AI tools (Claude Code, Cursor, etc.) can search, read, ask questions,
 * generate content, and browse your workspace.
 *
 * Tools:
 *   search           — Full-text search across workspace
 *   read_artifact    — Read full content of an artifact
 *   list_groups      — List artifact groups with counts
 *   get_manifest     — Full workspace overview
 *   ask_question     — RAG-powered Q&A over workspace docs
 *   generate_content — Generate status updates, PRDs, handoffs
 *   get_hygiene      — Document hygiene report (duplicates, stale)
 *   get_trends       — Workspace health trends and alerts
 *   list_repos       — Connected git repositories
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *   # or via bin: npx hub-mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "path";

const hubRoot = resolve(__dirname, "../..");
process.chdir(hubRoot);

// Lazy imports
async function getDb() {
  const { searchArtifacts, getArtifactContent, getArtifactCount } = await import("../lib/db.js");
  return { searchArtifacts, getArtifactContent, getArtifactCount };
}

async function getManifestStore() {
  const { getManifest } = await import("../lib/manifest-store.js");
  return { getManifest };
}

async function getRag() {
  const { askWorkspace } = await import("../lib/rag.js");
  return { askWorkspace };
}

async function getGenerator() {
  const { generate, getTemplates } = await import("../lib/generator.js");
  return { generate, getTemplates };
}

async function getTrendsLib() {
  const { getTrends, getPredictiveAlerts } = await import("../lib/trends.js");
  return { getTrends, getPredictiveAlerts };
}

async function main() {
  const server = new McpServer({
    name: "the-hub",
    version: "2.0.0",
  });

  // ── Tool: search ────────────────────────────────────────────────

  server.tool(
    "search",
    "Search The Hub's indexed workspace using full-text search. Returns ranked results with snippets.",
    {
      query: z.string().describe("Search query (supports FTS5 syntax: AND, OR, NOT, phrases)"),
      limit: z.number().optional().default(10).describe("Max results (default 10)"),
    },
    async ({ query, limit }) => {
      const db = await getDb();
      const results = db.searchArtifacts(query, limit);

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: `No results found for "${query}".` }] };
      }

      const text = results
        .map((r, i) => `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet || "No preview."}`)
        .join("\n\n");

      return { content: [{ type: "text" as const, text: `Found ${results.length} result(s) for "${query}":\n\n${text}` }] };
    },
  );

  // ── Tool: read_artifact ─────────────────────────────────────────

  server.tool(
    "read_artifact",
    "Read the full content of an artifact by path. Use search first to find paths.",
    {
      path: z.string().describe("Artifact path (e.g. 'my-project/docs/architecture.md')"),
    },
    async ({ path }) => {
      const db = await getDb();
      const content = db.getArtifactContent(path);
      if (content === null) {
        return { content: [{ type: "text" as const, text: `Artifact not found: "${path}".` }] };
      }
      return { content: [{ type: "text" as const, text: content }] };
    },
  );

  // ── Tool: list_groups ───────────────────────────────────────────

  server.tool(
    "list_groups",
    "List all artifact groups with counts and metadata.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      const text = manifest.groups
        .map((g) => `- **${g.label}** (${g.id}): ${g.count} artifact(s) — ${g.description || "No description"}`)
        .join("\n");

      return { content: [{ type: "text" as const, text: `${manifest.artifacts.length} artifacts across ${manifest.groups.length} groups:\n\n${text}` }] };
    },
  );

  // ── Tool: get_manifest ──────────────────────────────────────────

  server.tool(
    "get_manifest",
    "Full workspace overview: all artifacts, groups, and metadata.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      const summary = {
        generatedAt: manifest.generatedAt,
        workspaces: manifest.workspaces,
        groupCount: manifest.groups.length,
        artifactCount: manifest.artifacts.length,
        groups: manifest.groups.map((g) => ({ id: g.id, label: g.label, count: g.count, tab: g.tab })),
        artifacts: manifest.artifacts.map((a) => ({ path: a.path, title: a.title, type: a.type, group: a.group, staleDays: a.staleDays })),
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  // ── Tool: ask_question ──────────────────────────────────────────

  server.tool(
    "ask_question",
    "Ask a question about your workspace documents. Uses RAG to search relevant docs and generate an answer with source citations.",
    {
      question: z.string().describe("Natural language question about your workspace"),
    },
    async ({ question }) => {
      const rag = await getRag();
      const result = await rag.askWorkspace(question);

      let text = result.answer;
      if (result.sources.length > 0) {
        text += "\n\n**Sources:**\n" + result.sources.map((s) => `- ${s.title} (${s.path})`).join("\n");
      }

      return { content: [{ type: "text" as const, text }] };
    },
  );

  // ── Tool: generate_content ──────────────────────────────────────

  server.tool(
    "generate_content",
    "Generate content using workspace context. Templates: status-update (from change feed), handoff-doc (for a group), prd-outline (from research docs), custom (free-form).",
    {
      template: z.enum(["status-update", "handoff-doc", "prd-outline", "custom"]).describe("Template type"),
      groupId: z.string().optional().describe("Group ID (required for handoff-doc)"),
      artifactPaths: z.array(z.string()).optional().describe("Artifact paths (required for prd-outline)"),
      customPrompt: z.string().optional().describe("Custom prompt (required for custom template)"),
    },
    async ({ template, groupId, artifactPaths, customPrompt }) => {
      const gen = await getGenerator();
      const result = await gen.generate({ template, groupId, artifactPaths, customPrompt });

      let text = result.content;
      if (result.sourcePaths.length > 0) {
        text += "\n\n**Based on:** " + result.sourcePaths.join(", ");
      }

      return { content: [{ type: "text" as const, text }] };
    },
  );

  // ── Tool: get_hygiene ───────────────────────────────────────────

  server.tool(
    "get_hygiene",
    "Get document hygiene report: duplicates, near-duplicates, stale files, similar titles.",
    {
      severity: z.enum(["high", "medium", "low", "all"]).optional().default("all").describe("Filter by severity"),
    },
    async ({ severity }) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();
      const { analyzeHygiene } = await import("../lib/hygiene-analyzer.js");
      const report = analyzeHygiene(manifest.artifacts, manifest.generatedAt);

      const findings = severity === "all"
        ? report.findings
        : report.findings.filter((f) => f.severity === severity);

      if (findings.length === 0) {
        return { content: [{ type: "text" as const, text: "No hygiene issues found." }] };
      }

      const text = findings.slice(0, 15).map((f) => {
        const paths = f.artifacts.map((a) => a.path).join(", ");
        const sim = f.similarity != null ? ` (${Math.round(f.similarity * 100)}% similar)` : "";
        return `- **${f.type}** [${f.severity}]${sim}: ${paths}\n  ${f.suggestion}`;
      }).join("\n\n");

      return {
        content: [{ type: "text" as const, text: `${findings.length} hygiene finding(s):\n\n${text}\n\nStats: ${report.stats.filesAnalyzed} files analyzed.` }],
      };
    },
  );

  // ── Tool: get_trends ────────────────────────────────────────────

  server.tool(
    "get_trends",
    "Get workspace health trends and predictive alerts. Shows artifact count, staleness, and group trends over time.",
    {
      days: z.number().optional().default(30).describe("Number of days of trend data (default 30)"),
    },
    async ({ days }) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();
      const lib = await getTrendsLib();
      const trends = lib.getTrends(days);
      const alerts = lib.getPredictiveAlerts(manifest);

      const parts: string[] = [];

      if (trends.dates.length > 0) {
        const latest = trends.dates.length - 1;
        parts.push(`**Current state:** ${trends.total[latest]} artifacts (${trends.fresh[latest]} fresh, ${trends.stale[latest]} stale)`);
        parts.push(`**Stale %:** ${trends.stalePercent[latest]}%`);
        parts.push(`**Data points:** ${trends.dates.length} days`);
      } else {
        parts.push("No trend data yet. Trends are recorded daily on each scan.");
      }

      if (alerts.length > 0) {
        parts.push("\n**Predictive Alerts:**");
        for (const alert of alerts) {
          parts.push(`- ⚠️ **${alert.groupLabel}**: ${alert.currentStalePercent}% stale → predicted ${alert.predictedStalePercent}% by ${alert.predictedDate}`);
        }
      }

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    },
  );

  // ── Tool: list_repos ────────────────────────────────────────────

  server.tool(
    "list_repos",
    "List all git repositories discovered under configured workspaces.",
    {},
    async () => {
      const { discoverRepos } = await import("../lib/repo-scanner.js");
      const { loadConfig } = await import("../lib/config.js");
      const config = loadConfig();
      const repos = discoverRepos(config.workspaces);

      if (repos.length === 0) {
        return { content: [{ type: "text" as const, text: "No git repositories found under configured workspaces." }] };
      }

      const text = repos.map((r) => {
        const flags = [
          r.hasClaudeFile ? "CLAUDE.md" : "",
          r.hasCursorRules ? ".cursorrules" : "",
        ].filter(Boolean).join(", ");
        return `- **${r.name}** (${r.branch}) — ${r.workspace}\n  ${r.browseUrl || r.path}${flags ? `\n  AI context: ${flags}` : ""}`;
      }).join("\n\n");

      return { content: [{ type: "text" as const, text: `${repos.length} repository(ies):\n\n${text}` }] };
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
