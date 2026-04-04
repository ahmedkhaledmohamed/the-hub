# Execution Steps

Each step is a single PR. Work through them sequentially. Each builds on the previous.

Every PR must pass CI checks (build + typecheck + test) before merge.

---

## Phase 0: Infrastructure

### ✅ Step 0 — Test framework & CI/CD
Add `vitest` as test runner. Create `vitest.config.ts` with path aliases matching `tsconfig.json`. Add test scripts to `package.json` (`test`, `test:watch`). Write tests for `db.ts` (14 tests: persistence, FTS5 search, user state, content hashing) and `scanner.ts` (11 tests: file discovery, title extraction, type detection, content map, group assignment). Create `.github/workflows/ci.yml` that runs typecheck + build + test on every PR and push to main.

**Acceptance**: `npm test` passes. CI runs on GitHub PRs. All 25 tests green.

---

## Phase 1: Foundation

### ✅ Step 1 — SQLite data layer
Add `better-sqlite3`. Create `src/lib/db.ts` with schema and migrations. Create tables: `artifacts` (path, title, type, group, content, hash, modified_at), `user_state` (pins, recents, notes), `search_index` (FTS5 virtual table). Modify `manifest-store.ts` to write artifacts into SQLite after each scan. Keep the in-memory manifest for backward compatibility — SQLite is additive.

**Acceptance**: `npm run build` passes. Artifacts are persisted in `.hub-data/hub.sqlite`. Restarting the server loads from SQLite before the first scan completes.

---

### ✅ Step 2 — Full-text search
Create `/api/search?q=` endpoint that queries the FTS5 index. Return ranked results with highlighted snippet matches. Update `command-palette.tsx` to call `/api/search` instead of client-side substring filtering. Keep client-side fallback for instant results while server query is in flight.

**Acceptance**: Searching for a phrase that appears deep in a document's body (not in the title or first 300 chars) returns that document.

---

### ✅ Step 3 — Expanded file type support
Refactor `scanner.ts` to use an extractor registry pattern. Each extractor handles: can-it-process (by extension), extract-title, extract-text-content, render-preview. Add extractors for `.txt`, `.json`, `.yaml`, `.toml`. Add `pdf-parse` dependency and a PDF extractor. Add `mammoth` dependency and a `.docx` extractor. Code files (`.ts`, `.py`, `.go`, `.rs`, etc.) get syntax-highlighted preview via existing `highlight.js`.

**Acceptance**: A PDF file in a configured workspace appears in the artifact list, is searchable by content, and renders a text preview.

---

### ✅ Step 4 — Content diffs in change feed
Store content hashes per artifact in SQLite (from step 1). On change detection in `change-feed.ts`, load the previous hash and current content. For markdown files, compute a word-level diff. Update the change feed UI component to show added/removed lines inline, collapsible per entry.

**Acceptance**: Editing a markdown file and reloading the change feed shows the specific lines that changed, not just "modified."

---

### ✅ Step 5 — MCP server (basic)
Add `@modelcontextprotocol/sdk` dependency. Create `src/mcp/server.ts` implementing an MCP server with tools: `search` (query the FTS5 index), `read_artifact` (return full content of an artifact by path), `list_groups` (return all groups with artifact counts), `get_manifest` (return the full manifest). Create a `hub-mcp` CLI entry point that starts the MCP server over stdio. Add MCP config example to README.

**Acceptance**: Adding The Hub to Claude Code's MCP config and asking "search my workspace for pricing" returns results from indexed artifacts.

---

### ✅ Step 6 — CLI tool
Create `bin/hub.js` as a thin HTTP client calling the existing API. Commands: `hub search <query>` (calls `/api/search`), `hub open <tab>` (opens browser to that tab), `hub status` (calls `/api/manifest`, prints artifact/group counts and staleness summary), `hub context compile --group <id>` (calls `/api/compile-context`). Add `"bin": { "hub": "./bin/hub.js" }` to `package.json`.

**Acceptance**: `npx hub search "architecture"` returns matching artifacts from the running Hub instance.

---

### ✅ Step 7 — New panel types
Add `chart` panel type: renders sparklines or gauge metrics from inline data in config. Add `checklist` panel type: renders a toggleable checklist with localStorage persistence (useful for sprint ceremonies, launch checklists). Add `custom` panel type: fetches HTML from a URL and renders in an iframe, or renders a markdown template with data bindings from the manifest.

**Acceptance**: Adding a `chart` panel to `hub.config.ts` with sample data renders a sparkline in the tab view.

---

### ✅ Step 8 — Import tools
Create `scripts/import-notion.ts`: reads a Notion export zip, converts pages to markdown, preserves directory structure, outputs to a target workspace path. Create `scripts/import-obsidian.ts`: reads an Obsidian vault directory, generates a `hub.config.ts` groups/tabs section that maps the vault structure. Create `scripts/import-bookmarks.ts`: reads a Chrome/Firefox bookmarks HTML export, generates a `links` panel config.

**Acceptance**: Running `npx tsx scripts/import-notion.ts ~/Downloads/notion-export ./my-workspace` produces markdown files that appear in The Hub after a rescan.

---

## Phase 2: Intelligence

### ✅ Step 9 — AI client abstraction
Extract the AI gateway logic from `src/app/api/hygiene/review/route.ts` into a shared `src/lib/ai-client.ts` module. Support configurable providers (OpenAI-compatible, Anthropic native, Ollama). Add streaming via Server-Sent Events. Add response caching in SQLite with configurable TTL. Config: `ai.provider`, `ai.model`, `ai.apiKey`, `ai.baseUrl` in env vars.

**Acceptance**: The hygiene review endpoint uses the shared client. A new `/api/ai/complete` endpoint accepts arbitrary prompts and streams responses.

---

### ✅ Step 10 — AI summarization
Add a summarization pipeline that uses the AI client. On scan, for artifacts longer than 500 words, generate a 2-sentence summary. Store summaries in SQLite with a content-hash key (only regenerate when content changes). Show AI summaries on artifact cards instead of raw snippets (with a toggle). Add "Summarize this group" action that concatenates all artifacts in a group and generates an aggregate summary.

**Acceptance**: Artifact cards show AI-generated summaries. Clicking "Summarize group" on a group header produces a coherent summary of all docs in that group.

---

### ✅ Step 11 — Semantic search with embeddings
Add embedding generation to the scan pipeline. Use the AI client to embed artifact content (chunked at ~500 tokens). Store embeddings in SQLite via `sqlite-vec` extension or a separate HNSW index file. Create a hybrid search function that combines FTS5 BM25 scores with cosine similarity. Update `/api/search` to use hybrid ranking. Update the MCP server's search tool to use hybrid search.

**Acceptance**: Searching "how do we handle enterprise customers" returns the pricing strategy doc even if it never uses those exact words.

---

### ✅ Step 12 — Workspace Q&A (RAG)
Create `/api/ai/ask` endpoint. Pipeline: user question → hybrid search → top-5 chunks → construct prompt with chunks as context → LLM → answer with source citations. Create a Q&A UI: either a dedicated `/ask` page or an expanded Cmd+K mode (type a question instead of a keyword). Show cited artifacts as clickable links below the answer.

**Acceptance**: Asking "What's the status of the Q2 roadmap?" returns a synthesized answer citing specific artifacts, with links to open them.

---

### ✅ Step 13 — Content generation
Create `/api/ai/generate` endpoint with template types: `status-update` (uses change feed data from the past week), `handoff-doc` (uses all artifacts in a specified group), `prd-outline` (uses selected research artifacts as context). Create a "Generate" button/modal in the UI that lets users pick a template, select source artifacts, and stream the generated output. Generated docs can be saved as new artifacts via the existing new-doc flow.

**Acceptance**: Clicking "Generate status update" produces a draft that references actual changed documents from the past week.

---

### ✅ Step 14 — Knowledge graph (explicit links)
Add a `links` table in SQLite: `(source_path, target_path, link_type, created_at)`. Link types: `references`, `supersedes`, `related`. Parse markdown files for `[[wiki-style]]` links and auto-create relationships. Add a UI for manually linking artifacts (from the artifact card or preview panel). Show backlinks on each artifact: "Referenced by: doc-A, doc-B." Add a `/graph` page with a simple force-directed graph visualization (use `d3-force` or a lightweight canvas renderer).

**Acceptance**: Opening an artifact shows its backlinks. The `/graph` page renders a navigable graph of connected artifacts.

---

### ✅ Step 15 — Temporal intelligence
Add a `snapshots` table in SQLite that stores daily aggregate stats: total artifacts, per-group counts, staleness distribution. Record a snapshot on each scan (deduplicate by date). Create a `/api/trends` endpoint that returns time-series data. Add a "Trends" section to the briefing page: sparklines for total artifact count, stale percentage, and per-group growth/decay over the last 30/90 days. Add predictive alerts: "At current rate, Knowledge group will be 80% stale by [date]."

**Acceptance**: The briefing page shows trend sparklines. A group with increasing staleness shows a warning badge.

---

### ✅ Step 16 — Personalization
Track artifact opens in SQLite: `(path, opened_at)`. Track search queries: `(query, result_count, clicked_path, searched_at)`. Use this data to: reorder Cmd+K results (boost frequently accessed), show "Suggested for you" on the briefing page, detect search gaps (queries with 0 results → suggest creating a doc). Add a "Your activity" section to briefing: most-visited artifacts this week, time-of-day patterns.

**Acceptance**: Frequently opened artifacts appear higher in Cmd+K results. The briefing shows "You opened Architecture Overview 12 times this week."

---

### ✅ Step 17 — Ollama / local model support
Add an Ollama provider to `ai-client.ts`. Auto-detect a running Ollama instance at `localhost:11434`. If detected, use it for embeddings and completions without requiring any API key. Add a config toggle: `ai.provider: "ollama"` with `ai.model: "llama3"`. Fall back gracefully if Ollama isn't running. Update the AI review, summarization, Q&A, and generation flows to work with local models.

**Acceptance**: With Ollama running locally, all AI features work without setting any API key or env var.

---

## Phase 3: Platform

### Step 18 — Plugin system
Define `HubPlugin` interface in `src/lib/types.ts`: `name`, `version`, lifecycle hooks (`onScan`, `onIndex`, `onSearch`, `onRender`). Create `src/lib/plugin-registry.ts` that loads plugins from `plugins/` directory (each plugin is a directory with `index.ts` exporting a `HubPlugin`). Plugins can: contribute new file type extractors, add panel renderers, provide virtual artifacts (from external sources), extend search results. Create an example plugin (`plugins/hello-world/`) that adds a simple panel.

**Acceptance**: Dropping a plugin into `plugins/` and restarting The Hub loads it. The hello-world plugin renders a panel.

---

### Step 19 — GitHub plugin
Create `plugins/github/` that uses the GitHub API (via personal access token in env) to: show PR status and issue counts on repo cards, add a "GitHub Activity" panel type showing recent PRs/issues, contribute open issues as virtual artifacts searchable via Cmd+K. Respects rate limits, caches responses in SQLite.

**Acceptance**: Repo cards show PR count badges. Open GitHub issues appear in search results.

---

### Step 20 — Agentic workflows
Create `src/lib/agent-scheduler.ts` that runs scheduled and event-driven tasks. Define workflows in `hub.config.ts` under an `agents` key. Built-in workflow types: `stale-doc-reminder` (when a doc exceeds staleness threshold, draft an update and create a notification), `weekly-summary` (every Monday, generate a status update from the change feed), `duplicate-resolver` (when hygiene detects a duplicate, auto-create a consolidation suggestion). Workflows use the AI client for generation.

**Acceptance**: Configuring a `weekly-summary` agent in config produces a generated status update every Monday, saved as a new artifact.

---

### Step 21 — MCP server (full)
Expand the MCP server from step 5 with additional tools: `ask_question` (RAG Q&A), `generate_content` (status updates, PRDs), `get_hygiene_report` (duplicate findings), `get_trends` (temporal data), `list_repos` (connected repositories). Add resource support: expose artifacts as MCP resources that Claude can read directly. Register in MCP directories / awesome-mcp lists.

**Acceptance**: Claude Code can ask "generate a status update for my workspace" and The Hub's MCP server produces one using real change feed data.

---

### Step 22 — API authentication
Add optional API key authentication to all API routes. Keys are configured in `.env.local` as `HUB_API_KEYS=key1,key2`. When enabled, requests without a valid `Authorization: Bearer <key>` header return 401. The web UI gets a session token on first load. The MCP server and CLI include their key automatically. This is a prerequisite for shared/cloud deployments.

**Acceptance**: Setting `HUB_API_KEYS` in `.env.local` and restarting requires authentication for all API calls. The web UI still works seamlessly.

---

### Step 23 — Webhook / event system
Create `src/lib/events.ts` with an internal event bus. Events: `scan.complete`, `artifact.created`, `artifact.modified`, `artifact.deleted`, `hygiene.finding`, `agent.output`. Add `webhooks` config in `hub.config.ts`: array of `{ url, events, secret }`. On matching events, POST a JSON payload to the webhook URL with HMAC signature. Add a `/api/webhooks/test` endpoint for debugging.

**Acceptance**: Configuring a webhook URL and modifying a file sends a POST with the change details to that URL.

---

## Phase 4: Network

### Step 24 — Mobile PWA
Add `manifest.json` to `docs/` (or `public/` for the Next.js app) with app name, icons, theme color. Add a service worker that caches the shell and recent API responses. Make the existing UI responsive for mobile viewports (the layout already mostly works — fix any overflow/touch issues). Add a `/briefing` route that works well on small screens. Test on iOS Safari and Android Chrome.

**Acceptance**: Adding The Hub to your phone's home screen opens a full-screen app-like experience with the morning briefing.

---

### Step 25 — Multi-workspace contexts
Add a `contexts` config option: array of `{ name, config }` where each entry points to a different `hub.config.ts`. Add a context switcher in the sidebar. Each context has its own SQLite database, manifest, and scan state. Add a "Search across all contexts" toggle in Cmd+K that queries all databases. Persist active context in localStorage.

**Acceptance**: Switching between "Work" and "Side Projects" contexts loads completely different workspaces, tabs, and panels.

---

### Step 26 — Shared Hub instances
Add a `sharing` config section: `{ enabled: true, mode: "read-only" | "read-write", allowedUsers: [] }`. When enabled with authentication (step 22), multiple users can access the same Hub. Read-only users can browse and search but not archive/delete/create. Add a "Shared with" indicator in the nav. Activity tracking per user (who viewed what).

**Acceptance**: Two people on the same network can both access the same Hub instance, one as read-write and one as read-only.

---

### Step 27 — Hub-to-Hub linking
Add a `federation` config section: `{ peers: [{ name, url, apiKey }] }`. Create `/api/federation/search` that proxies search queries to peer Hubs and merges results. In Cmd+K, show results from linked Hubs with a "from: Ahmed's Hub" badge. Add a `/api/federation/artifact` endpoint that fetches and renders artifacts from peer Hubs. Network discovery via mDNS is a stretch goal.

**Acceptance**: Searching in your Hub returns results from a linked peer Hub, clearly labeled with the source.

---

### Step 28 — Cloud-hosted option
Create a `Dockerfile` and `docker-compose.yml` for containerized deployment. Replace filesystem scanning with a "source" abstraction: `FilesystemSource` (existing), `GitHubSource` (clones/pulls repos), `S3Source` (syncs from a bucket). Add a Vercel deployment template with GitHub as the source. The local Hub becomes the offline-capable client; the cloud version is always-on.

**Acceptance**: Deploying to Vercel with a GitHub repo as the source produces a working Hub that scans the repo on push.

---

### Step 29 — Governance and compliance
Add `governance` config section with: `retentionPolicy` (auto-archive docs older than N days), `complianceTags` (PII, confidential, public — applied via frontmatter or AI classification), `auditLog` (track all views, edits, deletions in SQLite with user + timestamp). Add an admin panel at `/admin` showing audit logs, compliance dashboard, and retention queue. AI auto-classification suggests tags for untagged docs.

**Acceptance**: The admin panel shows an audit trail of who accessed what. Docs tagged "confidential" show a badge. Expired docs are auto-archived.

---

### Step 30 — Plugin marketplace
Create a `hub-marketplace` repo/page that lists community plugins with install instructions. Add a `hub plugin install <name>` CLI command that downloads a plugin from npm or a git repo into `plugins/`. Add a "Browse plugins" section in the Hub UI. Revenue split: 70% to plugin author, 30% to platform (for paid plugins).

**Acceptance**: Running `hub plugin install github` downloads and installs the GitHub plugin. The marketplace page lists available plugins.
