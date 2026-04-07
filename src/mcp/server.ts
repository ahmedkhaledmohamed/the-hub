#!/usr/bin/env node

/**
 * The Hub MCP Server
 *
 * 23 core tools over stdio for AI assistants to understand and update your workspace.
 *
 * Tools:
 *   workspace_summary — Single-call workspace orientation
 *   search           — Full-text search across workspace
 *   read_artifact    — Read full content of an artifact
 *   list_groups    — List artifact groups with counts
 *   get_manifest   — Full workspace overview
 *   ask_question   — RAG-powered Q&A over workspace docs
 *   get_decisions  — Tracked decisions with contradiction detection
 *   get_hygiene    — Document hygiene report (duplicates, stale)
 *   get_trends     — Workspace health trends and alerts
 *   get_context      — Smart context window with impact-based prioritization
 *   generate_content — Generate status updates, PRDs, handoffs
 *   list_repos       — Connected git repositories
 *   detect_gaps      — Knowledge gap detection
 *   compile_context  — Meeting/topic context packets
 *   meeting_brief    — Pre-meeting briefings
 *   get_impact       — Impact score + stakeholders
 *   get_errors       — System error visibility
 *   remember         — Store cross-session observations
 *   recall           — Retrieve past observations
 *   catch_up         — What changed since last session
 *   create_doc       — Create a new document in the workspace
 *   update_artifact  — Append or replace content in an artifact
 *   mark_reviewed    — Mark an artifact as reviewed
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *   # or via bin: npx hub-mcp
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
    version: "6.0.0",
  });

  // ── Tool: workspace_summary ────────────────────────────── [CORE]

  server.tool(
    "workspace_summary",
    "Get a complete workspace orientation in one call. Returns: what this workspace is about, how it's organized (groups/tabs), what changed recently, what needs attention (stale docs, hygiene issues), and key decisions. Use this FIRST when starting a new session to understand the workspace before making targeted queries.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();
      const db = await getDb();

      const parts: string[] = [];

      // 1. Overview
      parts.push(`# Workspace Summary`);
      parts.push(`**${manifest.artifacts.length} artifacts** across **${manifest.groups.length} groups** in ${manifest.workspaces.length} workspace(s).`);
      parts.push(`Last scan: ${manifest.generatedAt}${manifest.lastScanReason ? ` (${manifest.lastScanReason})` : ""}\n`);

      // 2. Groups
      parts.push("## Groups");
      for (const g of manifest.groups) {
        parts.push(`- **${g.label}** (${g.id}): ${g.count} artifacts — ${g.description || "No description"}`);
      }

      // 3. Recently changed (last 7 days)
      const recent = manifest.artifacts
        .filter((a) => a.staleDays <= 7)
        .sort((a, b) => a.staleDays - b.staleDays)
        .slice(0, 10);
      if (recent.length > 0) {
        parts.push("\n## Recently Changed (last 7 days)");
        for (const a of recent) {
          parts.push(`- ${a.title} (${a.path}) — ${a.staleDays === 0 ? "today" : `${a.staleDays}d ago`}`);
        }
      }

      // 4. Needs attention (stale)
      const stale = manifest.artifacts
        .filter((a) => a.staleDays > 90)
        .sort((a, b) => b.staleDays - a.staleDays)
        .slice(0, 10);
      if (stale.length > 0) {
        parts.push(`\n## Needs Attention (${manifest.artifacts.filter((a) => a.staleDays > 90).length} stale docs)`);
        for (const a of stale) {
          parts.push(`- ${a.title} (${a.path}) — ${a.staleDays} days old`);
        }
      }

      // 5. Hygiene summary (quick count, no full analysis)
      try {
        const { getCachedHygieneSummary } = await import("../lib/hygiene-analyzer.js");
        const hygiene = getCachedHygieneSummary();
        if (hygiene && hygiene.totalFindings > 0) {
          parts.push(`\n## Hygiene Issues: ${hygiene.totalFindings} finding(s)`);
          if (hygiene.highCount > 0) parts.push(`- ${hygiene.highCount} high severity`);
          if (hygiene.mediumCount > 0) parts.push(`- ${hygiene.mediumCount} medium severity`);
          if (hygiene.lowCount > 0) parts.push(`- ${hygiene.lowCount} low severity`);
        }
      } catch { /* hygiene not available */ }

      // 6. Recent decisions
      try {
        const { getActiveDecisions, getDecisionCounts } = await import("../lib/decision-tracker.js");
        const counts = getDecisionCounts();
        if (counts.active > 0) {
          const decisions = getActiveDecisions(5);
          parts.push(`\n## Decisions (${counts.active} active, ${counts.superseded} superseded)`);
          for (const d of decisions) {
            parts.push(`- ${d.summary} — ${d.artifactPath}`);
          }
        }
      } catch { /* decisions not available */ }

      // 7. Predictive alerts
      try {
        const lib = await getTrendsLib();
        const alerts = lib.getPredictiveAlerts(manifest);
        if (alerts.length > 0) {
          parts.push("\n## Alerts");
          for (const alert of alerts.slice(0, 3)) {
            parts.push(`- **${alert.groupLabel}**: ${alert.currentStalePercent}% stale → predicted ${alert.predictedStalePercent}% by ${alert.predictedDate}`);
          }
        }
      } catch { /* trends not available */ }

      // 8. Planning source mentions
      try {
        const { getItemsWithMentions } = await import("../lib/planning-sources.js");
        const mentions = getItemsWithMentions();
        if (mentions.length > 0) {
          parts.push(`\n## Mentions (${mentions.length} planning docs reference you/your team)`);
          for (const m of mentions.slice(0, 5)) {
            parts.push(`- ${m.title} (${m.sourceId}) — mentions: ${m.mentions.join(", ")}`);
          }
        }
      } catch { /* planning sources not available */ }

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    },
  );

  // ── Tool: search ──────────────────────────────────────── [CORE]

  server.tool(
    "search",
    "Search The Hub's indexed workspace using full-text search. Returns ranked results with snippets.",
    {
      query: z.string().describe("Search query (supports FTS5 syntax: AND, OR, NOT, phrases)"),
      limit: z.number().optional().default(10).describe("Max results (default 10)"),
    },
    async ({ query, limit }) => {
      const start = performance.now();
      let fromCache = false;

      try {
        const { cachedToolCall } = await import("../lib/search-cache.js");
        const { result, cached } = await cachedToolCall("search", `mcp:search:${query}:${limit}`, async () => {
          const db = await getDb();
          return db.searchArtifacts(query, limit);
        });
        fromCache = cached;
        const results = result as Array<{ title: string; path: string; snippet: string }>;
        const durationMs = Math.round((performance.now() - start) * 100) / 100;

        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: `No results found for "${query}". (${durationMs}ms${fromCache ? ", cached" : ""})` }] };
        }

        const text = results
          .map((r, i) => `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet || "No preview."}`)
          .join("\n\n");

        return { content: [{ type: "text" as const, text: `Found ${results.length} result(s) for "${query}" (${durationMs}ms${fromCache ? ", cached" : ""}):\n\n${text}` }] };
      } catch {
        // Fallback without cache
        const db = await getDb();
        const results = db.searchArtifacts(query, limit);
        if (results.length === 0) return { content: [{ type: "text" as const, text: `No results found for "${query}".` }] };
        const text = results.map((r, i) => `${i + 1}. **${r.title}** (${r.path})\n   ${r.snippet || "No preview."}`).join("\n\n");
        return { content: [{ type: "text" as const, text: `Found ${results.length} result(s) for "${query}":\n\n${text}` }] };
      }
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

  // ── Tool: get_context ──────────────────────────────────── [CORE]

  server.tool(
    "get_context",
    "Get optimally-sized context for a topic. Uses impact scoring to prioritize high-value docs and allocate more space to critical artifacts. Returns ranked, truncated content ready for LLM consumption.",
    {
      topic: z.string().describe("Topic or question to gather context for"),
      budget: z.number().optional().default(12000).describe("Max characters budget (default 12000)"),
      maxSources: z.number().optional().default(8).describe("Max source documents (default 8)"),
    },
    async ({ topic, budget, maxSources }) => {
      try {
        const { buildSmartContext, formatSmartContext } = await import("../lib/smart-context.js");
        const ctx = buildSmartContext(topic, { budgetChars: budget, maxEntries: maxSources });
        const text = formatSmartContext(ctx);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Context retrieval failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: get_hygiene ──────────────────────────────────── [CORE]

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

  // ── Tool: get_trends ───────────────────────────────────── [CORE]

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

  // ── Tool: get_decisions ────────────────────────────────── [CORE]

  server.tool(
    "get_decisions",
    "Get tracked decisions from workspace documents. Shows active, superseded, and reverted decisions with sources.",
    {
      status: z.enum(["active", "all"]).optional().default("active").describe("Filter: 'active' (default) or 'all'"),
      search: z.string().optional().describe("Search decisions by keyword"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async ({ status, search, limit }) => {
      try {
        const { getActiveDecisions, searchDecisions, getDecisionCounts } = await import("../lib/decision-tracker.js");
        const counts = getDecisionCounts();

        let decisions;
        if (search) {
          decisions = searchDecisions(search).slice(0, limit);
        } else if (status === "all") {
          decisions = getActiveDecisions(limit * 2).slice(0, limit);
        } else {
          decisions = getActiveDecisions(limit);
        }

        if (decisions.length === 0) {
          return { content: [{ type: "text" as const, text: `No decisions found.${search ? ` (searched: "${search}")` : ""}\n\nCounts: ${JSON.stringify(counts)}` }] };
        }

        const text = decisions.map((d, i) =>
          `${i + 1}. [${d.status.toUpperCase()}] ${d.summary}\n   Source: ${d.artifactPath}${d.actor ? ` | Actor: ${d.actor}` : ""}${d.source === "ai" ? " | AI-extracted" : ""}`
        ).join("\n\n");

        return { content: [{ type: "text" as const, text: `${decisions.length} decision(s) (${counts.active} active, ${counts.superseded} superseded, ${counts.reverted} reverted):\n\n${text}` }] };
      } catch {
        return { content: [{ type: "text" as const, text: "Decision tracking not available." }] };
      }
    },
  );

  // ── Tool: create_doc ──────────────────────────────────── [CORE]

  server.tool(
    "create_doc",
    "Create a new document in a workspace directory. Writes a file to disk and triggers a rescan so it appears in the manifest.",
    {
      path: z.string().describe("Relative path within a workspace (e.g., 'docs/new-doc.md')"),
      content: z.string().describe("Full document content (markdown, text, etc.)"),
      title: z.string().optional().describe("Document title (default: extracted from content or filename)"),
    },
    async ({ path: docPath, content, title }) => {
      const { writeFileSync, mkdirSync, existsSync } = await import("fs");
      const { dirname, join, resolve: pathResolve } = await import("path");
      const { loadConfig } = await import("../lib/config.js");
      const config = loadConfig();

      if (config.workspaces.length === 0) {
        return { content: [{ type: "text" as const, text: "No workspaces configured. Add a workspace to hub.config.ts first." }] };
      }

      // Resolve against first workspace
      const wsPath = config.workspaces[0].path;
      const fullPath = pathResolve(wsPath, docPath);

      // Safety: ensure path is within workspace
      if (!fullPath.startsWith(pathResolve(wsPath))) {
        return { content: [{ type: "text" as const, text: `Path "${docPath}" escapes workspace boundary.` }] };
      }

      // Create directories if needed
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      // Write file
      writeFileSync(fullPath, content, "utf8");

      const docTitle = title || docPath.split("/").pop()?.replace(/\.\w+$/, "") || docPath;
      return {
        content: [{
          type: "text" as const,
          text: `Created "${docTitle}" at ${docPath}\nFull path: ${fullPath}\nSize: ${content.length} bytes\n\nThe file watcher will pick it up within ~5 seconds, or call get_manifest to refresh.`,
        }],
      };
    },
  );

  // ── Tool: update_artifact ────────────────────────────────── [CORE]

  server.tool(
    "update_artifact",
    "Update an existing artifact's content. Can append to the end or replace the full content.",
    {
      path: z.string().describe("Artifact path (as shown in manifest)"),
      content: z.string().describe("New content to write"),
      mode: z.enum(["append", "replace"]).optional().default("append").describe("'append' adds to end (default), 'replace' overwrites entirely"),
    },
    async ({ path: artifactPath, content, mode }) => {
      const { writeFileSync, readFileSync, existsSync } = await import("fs");
      const { resolve: pathResolve } = await import("path");
      const { loadConfig } = await import("../lib/config.js");
      const config = loadConfig();

      // Find the artifact's full path
      let fullPath: string | null = null;
      for (const ws of config.workspaces) {
        const candidate = pathResolve(ws.path, artifactPath);
        if (existsSync(candidate)) {
          fullPath = candidate;
          break;
        }
      }

      if (!fullPath) {
        return { content: [{ type: "text" as const, text: `Artifact not found: "${artifactPath}". Use create_doc to create a new file.` }] };
      }

      if (mode === "append") {
        const existing = readFileSync(fullPath, "utf8");
        const separator = existing.endsWith("\n") ? "\n" : "\n\n";
        writeFileSync(fullPath, existing + separator + content, "utf8");
      } else {
        writeFileSync(fullPath, content, "utf8");
      }

      return {
        content: [{
          type: "text" as const,
          text: `Updated "${artifactPath}" (${mode}). ${content.length} bytes ${mode === "append" ? "appended" : "written"}.`,
        }],
      };
    },
  );

  // ── Tool: mark_reviewed ──────────────────────────────────── [CORE]

  server.tool(
    "mark_reviewed",
    "Mark an artifact as reviewed — creates a review record with 'approved' status. Use this after checking a document to track that it has been reviewed.",
    {
      path: z.string().describe("Artifact path to mark as reviewed"),
      reviewer: z.string().optional().default("ai-assistant").describe("Reviewer name (default: 'ai-assistant')"),
      message: z.string().optional().default("").describe("Optional review comment"),
    },
    async ({ path: artifactPath, reviewer, message }) => {
      try {
        const { createReviewRequest, updateReviewStatus } = await import("../lib/reviews.js");

        // Create a review request and immediately approve it
        const id = createReviewRequest({
          artifactPath,
          requestedBy: reviewer,
          reviewer,
          message: message || "Reviewed via MCP tool",
        });
        updateReviewStatus(id, "approved", message || "Approved via MCP tool");

        return {
          content: [{
            type: "text" as const,
            text: `Marked "${artifactPath}" as reviewed by ${reviewer} (review #${id}).${message ? ` Comment: ${message}` : ""}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to mark reviewed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Restored tools (v6.1 — aligned with context engine direction) ──

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
      if (result.sourcePaths.length > 0) text += "\n\n**Based on:** " + result.sourcePaths.join(", ");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "list_repos",
    "List all git repositories discovered under configured workspaces.",
    {},
    async () => {
      const { discoverRepos } = await import("../lib/repo-scanner.js");
      const { loadConfig } = await import("../lib/config.js");
      const config = loadConfig();
      const repos = discoverRepos(config.workspaces);
      if (repos.length === 0) return { content: [{ type: "text" as const, text: "No git repositories found." }] };
      const text = repos.map((r) => {
        const flags = [r.hasClaudeFile ? "CLAUDE.md" : "", r.hasCursorRules ? ".cursorrules" : ""].filter(Boolean).join(", ");
        return `- **${r.name}** (${r.branch}) — ${r.workspace}${flags ? `\n  AI context: ${flags}` : ""}`;
      }).join("\n\n");
      return { content: [{ type: "text" as const, text: `${repos.length} repository(ies):\n\n${text}` }] };
    },
  );

  server.tool(
    "detect_gaps",
    "Detect knowledge gaps — topics people search for but have no documentation.",
    { days: z.number().optional().default(30).describe("Look back N days (default 30)") },
    async ({ days }) => {
      try {
        const { detectGaps, formatGapReport } = await import("../lib/knowledge-gaps.js");
        return { content: [{ type: "text" as const, text: formatGapReport(detectGaps({ days })) }] };
      } catch (err) { return { content: [{ type: "text" as const, text: `Gap detection failed: ${(err as Error).message}` }] }; }
    },
  );

  server.tool(
    "compile_context",
    "Compile a context packet for a meeting or topic. Gathers related docs, decisions, changes, and conflicts.",
    {
      topic: z.string().describe("Meeting title or topic"),
      changeDays: z.number().optional().default(7).describe("Look back N days for changes (default 7)"),
    },
    async ({ topic, changeDays }) => {
      try {
        const { compileContext, formatContextPacket } = await import("../lib/context-compiler.js");
        return { content: [{ type: "text" as const, text: formatContextPacket(compileContext(topic, new Date().toISOString(), { changeDays })) }] };
      } catch (err) { return { content: [{ type: "text" as const, text: `Context compilation failed: ${(err as Error).message}` }] }; }
    },
  );

  server.tool(
    "meeting_brief",
    "Generate a pre-meeting briefing with related docs, decisions, changes, conflicts, and action items.",
    {
      topic: z.string().describe("Meeting title or topic"),
      changeDays: z.number().optional().default(7).describe("Look back N days (default 7)"),
    },
    async ({ topic, changeDays }) => {
      try {
        const { generateMeetingBriefing } = await import("../lib/meeting-briefing.js");
        return { content: [{ type: "text" as const, text: generateMeetingBriefing(topic, new Date().toISOString(), { changeDays }).briefingText }] };
      } catch (err) { return { content: [{ type: "text" as const, text: `Meeting brief failed: ${(err as Error).message}` }] }; }
    },
  );

  server.tool(
    "get_impact",
    "Get impact score for an artifact — who needs to know when this doc changes.",
    { path: z.string().describe("Artifact path to score") },
    async ({ path }) => {
      try {
        const { computeImpactScore } = await import("../lib/impact-scoring.js");
        const score = computeImpactScore(path);
        const stakeholders = score.stakeholders.length > 0
          ? score.stakeholders.map((s) => `  - ${s.name} (${s.reason}) — relevance: ${s.relevance}`).join("\n")
          : "  No stakeholders identified yet.";
        return { content: [{ type: "text" as const, text: `**Impact: ${score.score}/100 (${score.level})**\nPath: ${score.artifactPath}\nStakeholders:\n${stakeholders}` }] };
      } catch { return { content: [{ type: "text" as const, text: "Impact scoring not available." }] }; }
    },
  );

  server.tool(
    "get_errors",
    "Get recent system errors and warnings.",
    {
      category: z.string().optional().describe("Filter by category"),
      limit: z.number().optional().default(10).describe("Max results"),
    },
    async ({ category, limit }) => {
      try {
        const { getActiveErrors, getErrorSummary } = await import("../lib/error-reporter.js");
        const summary = getErrorSummary();
        const errors = getActiveErrors({ category: category as "scan" | "ai" | undefined, limit });
        if (errors.length === 0) return { content: [{ type: "text" as const, text: "No active errors. System is healthy." }] };
        const text = errors.map((e, i) => `${i + 1}. [${e.severity.toUpperCase()}] ${e.category}: ${e.message}${e.occurrences > 1 ? ` (×${e.occurrences})` : ""}`).join("\n\n");
        return { content: [{ type: "text" as const, text: `${summary.total} error(s):\n\n${text}` }] };
      } catch { return { content: [{ type: "text" as const, text: "Error reporting not available." }] }; }
    },
  );

  server.tool(
    "remember",
    "Store an observation, insight, or decision in persistent memory. Survives across sessions.",
    {
      content: z.string().describe("What to remember"),
      type: z.enum(["observation", "question", "insight", "decision", "context"]).optional().default("observation").describe("Type"),
      artifactPath: z.string().optional().describe("Related artifact path"),
      confidence: z.number().optional().default(1.0).describe("Confidence 0-1"),
    },
    async ({ content, type, artifactPath, confidence }) => {
      try {
        const { remember } = await import("../lib/agent-memory.js");
        const id = remember({ agentId: "mcp-client", sessionId: `session-${new Date().toISOString().slice(0, 10)}`, content, type, artifactPath, confidence });
        return { content: [{ type: "text" as const, text: `Remembered (id: ${id}, type: ${type}): "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"` }] };
      } catch (err) { return { content: [{ type: "text" as const, text: `Failed: ${(err as Error).message}` }] }; }
    },
  );

  server.tool(
    "recall",
    "Recall past observations, insights, and decisions from persistent memory.",
    {
      search: z.string().optional().describe("Search keyword"),
      type: z.enum(["observation", "question", "insight", "decision", "context"]).optional().describe("Filter by type"),
      artifactPath: z.string().optional().describe("Filter by artifact"),
      days: z.number().optional().default(30).describe("Look back N days"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async ({ search, type, artifactPath, days, limit }) => {
      try {
        const { recall: recallFn, getObservationCounts } = await import("../lib/agent-memory.js");
        const observations = recallFn({ search, type, artifactPath, days, limit });
        const counts = getObservationCounts();
        if (observations.length === 0) return { content: [{ type: "text" as const, text: `No memories found. Total: ${Object.values(counts).reduce((s, n) => s + n, 0)}.` }] };
        const text = observations.map((o, i) => `${i + 1}. [${o.type.toUpperCase()}] ${o.content}${o.artifactPath ? `\n   Related: ${o.artifactPath}` : ""}\n   ${o.createdAt}`).join("\n\n");
        return { content: [{ type: "text" as const, text: `${observations.length} memor${observations.length === 1 ? "y" : "ies"}:\n\n${text}` }] };
      } catch (err) { return { content: [{ type: "text" as const, text: `Failed: ${(err as Error).message}` }] }; }
    },
  );

  server.tool(
    "catch_up",
    "What changed since your last session. Shows updated docs, new decisions, and modified queried artifacts.",
    { sessionId: z.string().optional().describe("Session ID (default: most recent)") },
    async ({ sessionId }) => {
      try {
        const { generateCatchUp, formatCatchUp, getRecentSessions } = await import("../lib/session-tracker.js");
        const sid = sessionId || (getRecentSessions(1)[0]?.sessionId as string) || "default";
        return { content: [{ type: "text" as const, text: formatCatchUp(generateCatchUp(sid)) }] };
      } catch (err) { return { content: [{ type: "text" as const, text: `Catch-up failed: ${(err as Error).message}` }] }; }
    },
  );

  // ── Resource: artifact (dynamic, template-based) ─────────────────

  server.resource(
    "artifact",
    new ResourceTemplate("hub://artifact/{path}", {
      list: async () => {
        const store = await getManifestStore();
        const manifest = store.getManifest();
        return {
          resources: manifest.artifacts.slice(0, 100).map((a) => ({
            uri: `hub://artifact/${a.path}`,
            name: a.title,
            mimeType: "text/plain",
            description: `${a.type} artifact in ${a.group} (${a.staleDays}d old)`,
          })),
        };
      },
    }),
    {
      description: "Read a workspace artifact by path. Use list to discover available artifacts.",
    },
    async (uri, { path }) => {
      const db = await getDb();
      const content = db.getArtifactContent(path as string);

      if (!content) {
        return {
          contents: [{
            uri: uri.href,
            text: `Artifact not found: ${path}`,
            mimeType: "text/plain",
          }],
        };
      }

      return {
        contents: [{
          uri: uri.href,
          text: content,
          mimeType: "text/plain",
        }],
      };
    },
  );

  // ── Resource: manifest (static) ─────────────────────────────────

  server.resource(
    "manifest",
    "hub://manifest",
    {
      description: "The full workspace manifest — all artifacts, groups, and metadata as JSON.",
    },
    async (uri) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({
            generatedAt: manifest.generatedAt,
            artifactCount: manifest.artifacts.length,
            groupCount: manifest.groups.length,
            groups: manifest.groups.map((g) => ({ id: g.id, label: g.label, count: g.count })),
            artifacts: manifest.artifacts.map((a) => ({ path: a.path, title: a.title, type: a.type, group: a.group, staleDays: a.staleDays })),
          }, null, 2),
          mimeType: "application/json",
        }],
      };
    },
  );

  // ── Resource: status (health/stats) ──────────────────────────────

  server.resource(
    "status",
    "hub://status",
    {
      description: "Hub server health and stats — uptime, artifact count, AI status, feature availability, database size.",
    },
    async (uri) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();
      const db = await getDb();

      // AI status
      let aiConfigured = false;
      let aiProvider: string | null = null;
      try {
        const aiClient = await import("../lib/ai-client.js");
        aiConfigured = aiClient.isAiConfigured();
        const config = aiClient.getAiConfig();
        if (config) {
          if (config.gatewayUrl.includes("anthropic")) aiProvider = "Anthropic";
          else if (config.gatewayUrl.includes("openai")) aiProvider = "OpenAI";
          else if (config.gatewayUrl.includes("localhost:11434")) aiProvider = "Ollama";
          else aiProvider = "Custom";
        }
      } catch { /* non-critical */ }

      // DB stats
      let dbTables = 0;
      try {
        const tables = (await import("../lib/db.js")).getDb().prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).get() as { count: number };
        dbTables = tables.count;
      } catch { /* non-critical */ }

      // Feature availability
      const features = {
        search: true,
        hygiene: true,
        knowledgeGraph: true,
        changeFeed: true,
        ragQA: aiConfigured,
        summarization: aiConfigured,
        contentGeneration: aiConfigured,
        smartTriage: aiConfigured,
      };
      const availableCount = Object.values(features).filter(Boolean).length;

      const status = {
        server: {
          version: "6.0.0",
          nodeVersion: process.version,
          platform: process.platform,
          uptime: Math.round(process.uptime()),
        },
        workspace: {
          artifactCount: manifest.artifacts.length,
          groupCount: manifest.groups.length,
          lastScanReason: (manifest as unknown as Record<string, unknown>).lastScanReason || null,
          generatedAt: manifest.generatedAt,
        },
        ai: {
          configured: aiConfigured,
          provider: aiProvider,
        },
        database: {
          tables: dbTables,
        },
        features: {
          available: availableCount,
          total: Object.keys(features).length,
          details: features,
        },
        mcp: {
          tools: 23,
          resources: 4,
          prompts: 5,
        },
      };

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(status, null, 2),
          mimeType: "application/json",
        }],
      };
    },
  );

  // ── Resource: health (workspace health summary) ──────────────────

  server.resource(
    "health",
    "hub://health",
    {
      description: "Workspace health: hygiene score, staleness distribution, freshness, trend alerts, and quality metrics.",
    },
    async (uri) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      // Staleness distribution
      const fresh = manifest.artifacts.filter((a) => a.staleDays <= 7).length;
      const aging = manifest.artifacts.filter((a) => a.staleDays > 7 && a.staleDays <= 90).length;
      const stale = manifest.artifacts.filter((a) => a.staleDays > 90).length;
      const total = manifest.artifacts.length;
      const freshPercent = total > 0 ? Math.round((fresh / total) * 100) : 0;
      const stalePercent = total > 0 ? Math.round((stale / total) * 100) : 0;

      // Hygiene summary
      let hygiene = { totalFindings: 0, highCount: 0, mediumCount: 0, lowCount: 0 };
      try {
        const { getCachedHygieneSummary } = await import("../lib/hygiene-analyzer.js");
        const cached = getCachedHygieneSummary();
        if (cached) hygiene = cached;
      } catch { /* non-critical */ }

      // Trend alerts
      let alerts: Array<{ groupLabel: string; currentStalePercent: number; predictedStalePercent: number; predictedDate: string }> = [];
      try {
        const lib = await getTrendsLib();
        alerts = lib.getPredictiveAlerts(manifest);
      } catch { /* non-critical */ }

      // Quality score (0-100): freshness weighted + hygiene penalty
      const freshnessScore = freshPercent; // 0-100
      const hygienePenalty = Math.min(30, hygiene.highCount * 10 + hygiene.mediumCount * 3 + hygiene.lowCount * 1);
      const qualityScore = Math.max(0, freshnessScore - hygienePenalty);

      const health = {
        qualityScore,
        staleness: { fresh, aging, stale, total, freshPercent, stalePercent },
        hygiene: {
          totalFindings: hygiene.totalFindings,
          high: hygiene.highCount,
          medium: hygiene.mediumCount,
          low: hygiene.lowCount,
        },
        alerts: alerts.slice(0, 5).map((a) => ({
          group: a.groupLabel,
          currentStalePercent: a.currentStalePercent,
          predictedStalePercent: a.predictedStalePercent,
          predictedDate: a.predictedDate,
        })),
        generatedAt: new Date().toISOString(),
      };

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(health, null, 2),
          mimeType: "application/json",
        }],
      };
    },
  );

  // ── Prompt: summarize_group ──────────────────────────────────────

  server.prompt(
    "summarize_group",
    "Summarize recent changes and key documents in a workspace group.",
    {
      group: z.string().describe("Group ID to summarize (e.g., 'docs', 'planning', 'strategy')"),
    },
    async ({ group }) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();
      const groupArtifacts = manifest.artifacts
        .filter((a) => a.group === group)
        .sort((a, b) => a.staleDays - b.staleDays)
        .slice(0, 15);

      if (groupArtifacts.length === 0) {
        return {
          messages: [{ role: "user" as const, content: { type: "text" as const, text: `No artifacts found in group "${group}".` } }],
        };
      }

      const listing = groupArtifacts
        .map((a) => `- ${a.title} (${a.path}) — ${a.staleDays}d old, ${a.type}`)
        .join("\n");

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Summarize the "${group}" group in my workspace. Here are the ${groupArtifacts.length} most recent artifacts:\n\n${listing}\n\nProvide a brief overview of what this group contains, highlight the most recently modified documents, and note any that appear stale (30+ days old).`,
          },
        }],
      };
    },
  );

  // ── Prompt: draft_status_update ─────────────────────────────────

  server.prompt(
    "draft_status_update",
    "Draft a status update based on recent workspace activity.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      const recent = manifest.artifacts
        .filter((a) => a.staleDays <= 3)
        .sort((a, b) => a.staleDays - b.staleDays)
        .slice(0, 20);

      const stale = manifest.artifacts
        .filter((a) => a.staleDays > 30)
        .length;

      const listing = recent
        .map((a) => `- ${a.title} (${a.group}) — modified ${a.staleDays === 0 ? "today" : `${a.staleDays}d ago`}`)
        .join("\n");

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Draft a concise status update based on my recent workspace activity.\n\nRecently modified (last 3 days):\n${listing || "No recent changes."}\n\nWorkspace stats: ${manifest.artifacts.length} total artifacts, ${stale} stale (30+ days).\n\nWrite a 3-5 sentence status update summarizing what I've been working on, based on the recently modified documents. Be specific about topics, not file names.`,
          },
        }],
      };
    },
  );

  // ── Prompt: find_conflicts ──────────────────────────────────────

  server.prompt(
    "find_conflicts",
    "Analyze a group of documents for conflicting or contradictory information.",
    {
      group: z.string().describe("Group ID to check for conflicts"),
    },
    async ({ group }) => {
      const store = await getManifestStore();
      const manifest = store.getManifest();
      const db = await getDb();

      const groupArtifacts = manifest.artifacts
        .filter((a) => a.group === group)
        .slice(0, 10);

      const contents: string[] = [];
      for (const a of groupArtifacts) {
        const content = db.getArtifactContent(a.path);
        if (content) {
          contents.push(`## ${a.title} (${a.path})\n${content.slice(0, 2000)}`);
        }
      }

      if (contents.length < 2) {
        return {
          messages: [{ role: "user" as const, content: { type: "text" as const, text: `Need at least 2 documents in group "${group}" to check for conflicts. Found ${contents.length}.` } }],
        };
      }

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review these ${contents.length} documents from the "${group}" group and identify any contradictions, conflicting information, or inconsistencies between them.\n\n${contents.join("\n\n---\n\n")}\n\nFor each conflict found, specify which documents contradict each other and what the specific disagreement is.`,
          },
        }],
      };
    },
  );

  // ── Prompt: review_artifact ─────────────────────────────────────

  server.prompt(
    "review_artifact",
    "Review a specific artifact for quality, completeness, and freshness.",
    {
      path: z.string().describe("Artifact path to review"),
    },
    async ({ path }) => {
      const db = await getDb();
      const content = db.getArtifactContent(path);

      if (!content) {
        return {
          messages: [{ role: "user" as const, content: { type: "text" as const, text: `Artifact not found: ${path}` } }],
        };
      }

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review this document for quality and completeness:\n\n**Path:** ${path}\n\n${content.slice(0, 5000)}\n\nProvide feedback on:\n1. Is the content up-to-date?\n2. Are there any gaps or missing sections?\n3. Is the structure clear and well-organized?\n4. Any factual issues or outdated information?\n5. Suggested improvements.`,
          },
        }],
      };
    },
  );

  // ── Prompt: onboarding_brief ────────────────────────────────────

  server.prompt(
    "onboarding_brief",
    "Generate a reading guide for someone new to this workspace.",
    {},
    async () => {
      const store = await getManifestStore();
      const manifest = store.getManifest();

      const byGroup = new Map<string, number>();
      for (const a of manifest.artifacts) {
        byGroup.set(a.group, (byGroup.get(a.group) || 0) + 1);
      }

      const groupSummary = Array.from(byGroup.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([group, count]) => `- **${group}**: ${count} artifact(s)`)
        .join("\n");

      const keyDocs = manifest.artifacts
        .filter((a) => a.type === "md" && a.staleDays < 30)
        .sort((a, b) => a.staleDays - b.staleDays)
        .slice(0, 10)
        .map((a) => `- ${a.title} (${a.group}) — ${a.path}`)
        .join("\n");

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I'm new to this workspace. Create a reading guide for me.\n\nWorkspace contains ${manifest.artifacts.length} artifacts across ${byGroup.size} groups:\n${groupSummary}\n\nMost recently updated documents:\n${keyDocs}\n\nSuggest a reading order (5-8 documents) that would help me understand the key context. Prioritize foundational/overview docs first, then more specific ones.`,
          },
        }],
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
