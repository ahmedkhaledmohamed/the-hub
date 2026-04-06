/**
 * OpenAPI 3.1 specification for The Hub API.
 *
 * Hand-crafted spec covering all core endpoints.
 * Served at /api/docs as JSON.
 */

export function generateOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "The Hub API",
      version: "2.0.0",
      description: "Personal command center for knowledge workers. Scan, search, ask, generate, and manage your workspace.",
      license: { name: "MIT" },
    },
    servers: [
      { url: "http://localhost:9002", description: "Local (HTTP)" },
      { url: "https://localhost:9001", description: "Local (HTTPS)" },
    ],
    paths: {
      // ── Core ──
      "/api/manifest": {
        get: {
          summary: "Get workspace manifest",
          tags: ["Core"],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer" }, description: "Paginate artifacts (0=all)" },
            { name: "offset", in: "query", schema: { type: "integer" }, description: "Skip N artifacts" },
            { name: "group", in: "query", schema: { type: "string" }, description: "Filter by group ID" },
            { name: "tab", in: "query", schema: { type: "string" }, description: "Filter by tab ID" },
          ],
          responses: { "200": { description: "Manifest with artifacts, groups, metadata" } },
        },
      },
      "/api/search": {
        get: {
          summary: "Search artifacts (FTS + semantic)",
          tags: ["Core"],
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Search query" },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
            { name: "mode", in: "query", schema: { type: "string", enum: ["fts", "semantic", "hybrid", "auto"] } },
          ],
          responses: { "200": { description: "Paginated search results with scores" } },
        },
      },
      "/api/regenerate": {
        post: {
          summary: "Trigger workspace rescan",
          tags: ["Core"],
          responses: { "200": { description: "Rescan triggered" } },
        },
      },
      "/api/file/{path}": {
        get: {
          summary: "Serve a workspace file (markdown rendered as HTML)",
          tags: ["Core"],
          parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Rendered file content" } },
        },
      },
      "/api/resolve": {
        get: {
          summary: "Resolve artifact path to absolute filesystem path",
          tags: ["Core"],
          parameters: [{ name: "path", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Resolved path" } },
        },
      },
      "/api/repos": {
        get: { summary: "List discovered git repositories", tags: ["Core"], responses: { "200": { description: "Repository list" } } },
      },
      "/api/changes": {
        get: { summary: "Change feed (recent modifications with diffs)", tags: ["Core"], responses: { "200": { description: "Change entries" } } },
        post: { summary: "Set change feed baseline", tags: ["Core"], responses: { "200": { description: "Baseline saved" } } },
      },
      "/api/compile-context": {
        post: {
          summary: "Compile selected artifacts into markdown context",
          tags: ["Core"],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { paths: { type: "array", items: { type: "string" } } } } } } },
          responses: { "200": { description: "Compiled context" } },
        },
      },
      "/api/export": { post: { summary: "Export tab as standalone HTML", tags: ["Core"], responses: { "200": { description: "HTML snapshot" } } } },
      "/api/notes": { post: { summary: "Save quick notes", tags: ["Core"], responses: { "200": { description: "Saved" } } } },
      "/api/new-doc": {
        get: { summary: "List document templates", tags: ["Core"], responses: { "200": { description: "Templates" } } },
        post: { summary: "Create new document from template", tags: ["Core"], responses: { "200": { description: "Created" } } },
      },

      // ── AI ──
      "/api/ai/complete": {
        get: { summary: "Check AI configuration status", tags: ["AI"], responses: { "200": { description: "Config status" } } },
        post: {
          summary: "AI completion (streaming or non-streaming)",
          tags: ["AI"],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { prompt: { type: "string" }, messages: { type: "array" }, stream: { type: "boolean" } } } } } },
          responses: { "200": { description: "Completion result or SSE stream" } },
        },
      },
      "/api/ai/ask": {
        post: {
          summary: "RAG Q&A — ask questions about your workspace",
          tags: ["AI"],
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string" } } } } } },
          responses: { "200": { description: "Answer with source citations" } },
        },
      },
      "/api/ai/generate": {
        get: { summary: "List generation templates", tags: ["AI"], responses: { "200": { description: "Templates" } } },
        post: {
          summary: "Generate content (status update, handoff, PRD)",
          tags: ["AI"],
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["template"], properties: { template: { type: "string", enum: ["status-update", "handoff-doc", "prd-outline", "custom"] }, groupId: { type: "string" }, artifactPaths: { type: "array" }, customPrompt: { type: "string" } } } } } },
          responses: { "200": { description: "Generated content" } },
        },
      },
      "/api/ai/summarize": {
        get: {
          summary: "Summarize artifact or group",
          tags: ["AI"],
          parameters: [
            { name: "path", in: "query", schema: { type: "string" } },
            { name: "group", in: "query", schema: { type: "string" } },
            { name: "bulk", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Summary" } },
        },
      },

      // ── Hygiene ──
      "/api/hygiene": { get: { summary: "Document hygiene report", tags: ["Hygiene"], responses: { "200": { description: "Findings" } } } },
      "/api/hygiene/review": { post: { summary: "AI-powered hygiene review", tags: ["Hygiene"], responses: { "200": { description: "Review" } } } },
      "/api/hygiene/action": { post: { summary: "Archive or delete artifact", tags: ["Hygiene"], responses: { "200": { description: "Action result" } } } },
      "/api/hygiene/open": { post: { summary: "Open files in Cursor", tags: ["Hygiene"], responses: { "200": { description: "Opened" } } } },

      // ── Intelligence ──
      "/api/graph": {
        get: { summary: "Knowledge graph data or backlinks", tags: ["Intelligence"], responses: { "200": { description: "Nodes and edges" } } },
        post: { summary: "Add or remove artifact links", tags: ["Intelligence"], responses: { "200": { description: "Link modified" } } },
      },
      "/api/trends": { get: { summary: "Workspace health trends and alerts", tags: ["Intelligence"], responses: { "200": { description: "Trend data" } } } },
      "/api/activity": {
        get: { summary: "Activity summary and boost scores", tags: ["Intelligence"], responses: { "200": { description: "Activity data" } } },
        post: { summary: "Track user action", tags: ["Intelligence"], responses: { "200": { description: "Tracked" } } },
      },
      "/api/admin": {
        get: { summary: "Governance dashboard", tags: ["Intelligence"], responses: { "200": { description: "Dashboard data" } } },
        post: { summary: "Tag/untag artifacts, log audit", tags: ["Intelligence"], responses: { "200": { description: "Action result" } } },
      },

      // ── Platform ──
      "/api/plugins": { get: { summary: "List loaded plugins", tags: ["Platform"], responses: { "200": { description: "Plugin list" } } } },
      "/api/agents": {
        get: { summary: "List configured agents", tags: ["Platform"], responses: { "200": { description: "Agent statuses" } } },
        post: { summary: "Run agent(s)", tags: ["Platform"], responses: { "200": { description: "Agent results" } } },
      },
      "/api/webhooks": { get: { summary: "List webhooks and recent events", tags: ["Platform"], responses: { "200": { description: "Webhooks" } } } },
      "/api/webhooks/test": { post: { summary: "Emit test event", tags: ["Platform"], responses: { "200": { description: "Emitted" } } } },
      "/api/auth/session": {
        get: { summary: "Check auth status", tags: ["Platform"], responses: { "200": { description: "Auth status" } } },
        post: { summary: "Exchange API key for session", tags: ["Platform"], responses: { "200": { description: "Session token" } } },
      },
      "/api/framework": { get: { summary: "AI framework catalog", tags: ["Platform"], responses: { "200": { description: "Catalog" } } } },
      "/api/settings": { get: { summary: "Hub settings and directory info", tags: ["Platform"], responses: { "200": { description: "Settings" } } } },
      "/api/preferences": {
        get: { summary: "Read user preferences", tags: ["Platform"], responses: { "200": { description: "Preferences" } } },
        put: { summary: "Update user preferences", tags: ["Platform"], responses: { "200": { description: "Updated" } } },
      },

      "/api/docs": {
        get: { summary: "This OpenAPI specification", tags: ["Meta"], responses: { "200": { description: "OpenAPI 3.1 JSON" } } },
      },
    },
    tags: [
      { name: "Core", description: "Workspace scanning, search, and file operations" },
      { name: "AI", description: "AI-powered Q&A, summarization, and generation" },
      { name: "Hygiene", description: "Document hygiene and duplicate detection" },
      { name: "Intelligence", description: "Knowledge graph, trends, activity, governance" },
      { name: "Platform", description: "Plugins, agents, webhooks, auth, settings" },
      { name: "Meta", description: "API documentation" },
    ],
  };
}
