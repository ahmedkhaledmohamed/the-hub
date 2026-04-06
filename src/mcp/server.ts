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

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
    version: "5.0.0",
  });

  // v5: Only register core tools by default.
  // Set HUB_MCP_ALL_TOOLS=true to register all 19 tools.
  const allTools = process.env.HUB_MCP_ALL_TOOLS === "true";
  const coreToolCount = allTools ? 19 : 6;

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
        const { cachedToolCall } = await import("../lib/mcp-cache.js");
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

  // ── Non-core tools (registered when HUB_MCP_ALL_TOOLS=true) ────
  if (allTools) {

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

  } // end non-core tools block 1

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

  if (allTools) { // non-core tools block 2

  // ── Tool: ask_decisions ─────────────────────────────────────────

  server.tool(
    "ask_decisions",
    "Ask a natural language question about decisions made in the workspace. E.g., 'what was decided about authentication?' Returns matching decisions with sources and any contradictions.",
    {
      question: z.string().describe("Natural language question about decisions (e.g., 'what was decided about auth?')"),
    },
    async ({ question }) => {
      try {
        const { queryDecisions } = await import("../lib/decision-tracker.js");
        const result = queryDecisions(question);

        if (result.decisions.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No decisions found for: "${question}"\nKeywords searched: ${result.keywords.join(", ") || "none"}\n\nTry a more specific question, or check if decisions have been extracted from your documents.`,
            }],
          };
        }

        let text = `**${result.decisions.length} decision(s) found** for: "${question}"\nKeywords: ${result.keywords.join(", ")}\n\n`;

        text += result.decisions.map((d, i) => {
          let entry = `${i + 1}. [${d.status.toUpperCase()}] ${d.summary}`;
          entry += `\n   Source: ${d.artifactPath}`;
          if (d.actor) entry += ` | By: ${d.actor}`;
          if (d.decidedAt) entry += ` | Date: ${d.decidedAt}`;
          if (d.status === "superseded" && d.supersededBy) entry += ` | Superseded by decision #${d.supersededBy}`;
          if (d.detail) entry += `\n   Detail: ${d.detail.slice(0, 200)}`;
          return entry;
        }).join("\n\n");

        if (result.contradictions.length > 0) {
          text += `\n\n⚠️ **${result.contradictions.length} potential contradiction(s):**\n`;
          text += result.contradictions.map((c, i) =>
            `${i + 1}. "${c.decisionA.summary}" vs "${c.decisionB.summary}"\n   ${c.reason}`
          ).join("\n\n");
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Decision query failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: compile_context ───────────────────────────────────────

  server.tool(
    "compile_context",
    "Compile a context packet for a meeting or topic. Gathers related docs, recent decisions, changes, and conflicts into a ready-to-use briefing.",
    {
      topic: z.string().describe("Meeting title or topic (e.g., 'Architecture Review', 'Q3 Planning')"),
      changeDays: z.number().optional().default(7).describe("Look back N days for recent changes (default 7)"),
    },
    async ({ topic, changeDays }) => {
      try {
        const { compileContext, formatContextPacket } = await import("../lib/context-compiler.js");
        const packet = compileContext(topic, new Date().toISOString(), { changeDays });
        return { content: [{ type: "text" as const, text: formatContextPacket(packet) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Context compilation failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: catch_up ─────────────────────────────────────────────

  server.tool(
    "catch_up",
    "Get a catch-up report: what changed since your last session. Shows updated docs, new decisions, and artifacts you previously asked about that were modified.",
    {
      sessionId: z.string().optional().describe("Session ID to catch up from (default: most recent)"),
    },
    async ({ sessionId }) => {
      try {
        const { generateCatchUp, formatCatchUp, getRecentSessions } = await import("../lib/session-tracker.js");
        const sid = sessionId || (getRecentSessions(1)[0]?.sessionId as string) || "default";
        const report = generateCatchUp(sid);
        return { content: [{ type: "text" as const, text: formatCatchUp(report) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Catch-up failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: meeting_brief ────────────────────────────────────────

  server.tool(
    "meeting_brief",
    "Generate a pre-meeting briefing with related docs, decisions, changes, conflicts, and action items. Use before any meeting to get prepared.",
    {
      topic: z.string().describe("Meeting title or topic (e.g., 'Sprint Planning', 'Architecture Review')"),
      changeDays: z.number().optional().default(7).describe("Look back N days for changes (default 7)"),
    },
    async ({ topic, changeDays }) => {
      try {
        const { generateMeetingBriefing } = await import("../lib/meeting-briefing.js");
        const briefing = generateMeetingBriefing(topic, new Date().toISOString(), { changeDays });
        return { content: [{ type: "text" as const, text: briefing.briefingText }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Meeting brief failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: detect_gaps ──────────────────────────────────────────

  server.tool(
    "detect_gaps",
    "Detect knowledge gaps in the workspace — topics people search for but have no documentation. Helps identify what docs to create next.",
    {
      days: z.number().optional().default(30).describe("Look back N days (default 30)"),
    },
    async ({ days }) => {
      try {
        const { detectGaps, formatGapReport } = await import("../lib/knowledge-gaps.js");
        const report = detectGaps({ days });
        return { content: [{ type: "text" as const, text: formatGapReport(report) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Gap detection failed: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: get_impact ───────────────────────────────────────────

  server.tool(
    "get_impact",
    "Get impact score for an artifact — who needs to know when this doc changes. Shows stakeholders and signals.",
    {
      path: z.string().describe("Artifact path to score"),
    },
    async ({ path }) => {
      try {
        const { computeImpactScore } = await import("../lib/impact-scoring.js");
        const score = computeImpactScore(path);

        const stakeholderList = score.stakeholders.length > 0
          ? score.stakeholders.map((s) => `  - ${s.name} (${s.reason}) — relevance: ${s.relevance}`).join("\n")
          : "  No stakeholders identified yet.";

        const signalSummary = [
          `Access: ${score.signals.accessCount} views by ${score.signals.uniqueAccessors} users`,
          `Annotations: ${score.signals.annotationCount}`,
          `Reviews: ${score.signals.reviewCount}`,
          `Backlinks: ${score.signals.backlinkCount} docs depend on this`,
        ].join(" | ");

        return {
          content: [{
            type: "text" as const,
            text: `**Impact Score: ${score.score}/100 (${score.level})**\n\n` +
              `Path: ${score.artifactPath}\n` +
              `Signals: ${signalSummary}\n\n` +
              `Stakeholders:\n${stakeholderList}` +
              (score.downstreamPaths.length > 0 ? `\n\nDownstream docs (${score.downstreamPaths.length}): ${score.downstreamPaths.slice(0, 5).join(", ")}` : ""),
          }],
        };
      } catch {
        return { content: [{ type: "text" as const, text: "Impact scoring not available." }] };
      }
    },
  );

  // ── Tool: get_errors ───────────────────────────────────────────

  server.tool(
    "get_errors",
    "Get recent system errors and warnings. Useful for debugging issues with the Hub.",
    {
      category: z.string().optional().describe("Filter by category: scan, search, ai, api, integration, plugin, system, config"),
      limit: z.number().optional().default(10).describe("Max results"),
    },
    async ({ category, limit }) => {
      try {
        const { getActiveErrors, getErrorSummary } = await import("../lib/error-reporter.js");
        const summary = getErrorSummary();
        const errors = getActiveErrors({
          category: category as "scan" | "ai" | undefined,
          limit,
        });

        if (errors.length === 0 && summary.total === 0) {
          return { content: [{ type: "text" as const, text: "No active errors. System is healthy." }] };
        }

        const text = errors.map((e, i) =>
          `${i + 1}. [${e.severity.toUpperCase()}] ${e.category}: ${e.message}${e.occurrences > 1 ? ` (×${e.occurrences})` : ""}\n   Last seen: ${e.lastSeen}`
        ).join("\n\n");

        return {
          content: [{
            type: "text" as const,
            text: `${summary.total} active error(s) (${summary.critical} critical, ${summary.warning} warnings):\n\n${text}`,
          }],
        };
      } catch {
        return { content: [{ type: "text" as const, text: "Error reporting not available." }] };
      }
    },
  );

  // ── Tool: remember (agent memory write) ─────────────────────────

  server.tool(
    "remember",
    "Store an observation, insight, or decision in The Hub's persistent memory. Survives across sessions — use this to remember important context about the workspace.",
    {
      content: z.string().describe("What to remember (observation, insight, decision, or question)"),
      type: z.enum(["observation", "question", "insight", "decision", "context"]).optional().default("observation").describe("Type of memory"),
      artifactPath: z.string().optional().describe("Related artifact path (if applicable)"),
      confidence: z.number().optional().default(1.0).describe("Confidence level 0-1"),
    },
    async ({ content, type, artifactPath, confidence }) => {
      try {
        const { remember } = await import("../lib/agent-memory.js");
        const id = remember({
          agentId: "mcp-client",
          sessionId: `session-${new Date().toISOString().slice(0, 10)}`,
          content,
          type,
          artifactPath,
          confidence,
        });
        return {
          content: [{
            type: "text" as const,
            text: `Remembered (id: ${id}, type: ${type}): "${content.slice(0, 100)}${content.length > 100 ? "..." : ""}"`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to remember: ${(err as Error).message}` }] };
      }
    },
  );

  // ── Tool: recall (agent memory read) ───────────────────────────

  server.tool(
    "recall",
    "Recall past observations, insights, and decisions from The Hub's persistent memory. Query by keyword, type, or artifact to retrieve cross-session context.",
    {
      search: z.string().optional().describe("Search keyword in memory content"),
      type: z.enum(["observation", "question", "insight", "decision", "context"]).optional().describe("Filter by type"),
      artifactPath: z.string().optional().describe("Filter by related artifact"),
      days: z.number().optional().default(30).describe("Look back N days (default 30)"),
      limit: z.number().optional().default(20).describe("Max results"),
    },
    async ({ search, type, artifactPath, days, limit }) => {
      try {
        const { recall: recallFn, getObservationCounts } = await import("../lib/agent-memory.js");
        const observations = recallFn({ search, type, artifactPath, days, limit });
        const counts = getObservationCounts();

        if (observations.length === 0) {
          const totalMemories = Object.values(counts).reduce((s, n) => s + n, 0);
          return {
            content: [{
              type: "text" as const,
              text: `No memories found${search ? ` for "${search}"` : ""}${type ? ` (type: ${type})` : ""}. Total memories: ${totalMemories}.`,
            }],
          };
        }

        const text = observations.map((o, i) =>
          `${i + 1}. [${o.type.toUpperCase()}] ${o.content}${o.artifactPath ? `\n   Related: ${o.artifactPath}` : ""}\n   ${o.createdAt} (confidence: ${o.confidence})`
        ).join("\n\n");

        const countSummary = Object.entries(counts).map(([t, c]) => `${t}: ${c}`).join(", ");

        return {
          content: [{
            type: "text" as const,
            text: `${observations.length} memor${observations.length === 1 ? "y" : "ies"} found (total: ${countSummary}):\n\n${text}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Failed to recall: ${(err as Error).message}` }] };
      }
    },
  );

  } // end non-core tools block 2

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
          version: "3.0.0",
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
          tools: coreToolCount,
          resources: 3,
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
