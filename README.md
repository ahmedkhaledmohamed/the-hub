# The Hub

[![npm](https://img.shields.io/npm/v/the-hub)](https://www.npmjs.com/package/the-hub)

A config-driven personal command center that indexes your workspaces and surfaces everything in a searchable, AI-augmented interface.

Point it at your directories. It scans your files, groups them by pattern, and gives you a morning briefing, document hygiene analysis, knowledge graphs, and full-text search — from your browser, terminal, or any AI tool via MCP.

![Briefing](docs/screenshots/briefing.png)

## Quick Start

### npx (fastest)

```bash
npx the-hub
```

First run creates `hub.config.ts` — edit it to add your workspace paths, then run again.

### Git Clone

```bash
git clone https://github.com/ahmedkhaledmohamed/the-hub.git
cd the-hub && npm install
cp hub.config.example.ts hub.config.ts   # Edit with your workspace paths
npm run dev                              # Dev server on localhost:9001
```

### Docker

```bash
git clone https://github.com/ahmedkhaledmohamed/the-hub.git
cd the-hub
cp hub.config.example.ts hub.config.ts   # Edit with your workspace paths
docker compose up -d
open http://localhost:9002
```

## What It Does

- **Scans directories** and builds a searchable catalog of artifacts (md, html, pdf, docx, json, yaml, code files, and more)
- **Full-text search** powered by SQLite FTS5 — finds content deep inside documents, not just titles
- **Morning briefing** with recent changes, stale docs, calendar events, and predictive insights
- **Document hygiene** — detects duplicates, near-duplicates, stale docs, orphaned files
- **Knowledge graph** — wiki-link relationships with interactive force-directed visualization
- **AI-powered Q&A** — ask natural language questions about your workspace via RAG
- **Multi-model AI** — works with Ollama (free, local), OpenAI, or Anthropic

## AI Setup

The Hub works without AI, but it's better with it. Configure providers in Settings (`/settings`) or via environment variables:

**Option 1: Ollama (free, local)**
```bash
# Install from ollama.com, then:
ollama pull llama3
# The Hub auto-detects Ollama — no config needed
```

**Option 2: Cloud API**

Set in `/settings` page, or via environment:
```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

## Configuration

Everything lives in `hub.config.ts` (gitignored). See `hub.config.example.ts` for the full schema.

```typescript
const config: HubConfig = {
  name: "My Hub",
  workspaces: [{ path: "~/Developer/my-project", label: "My Project" }],
  groups: [
    { id: "docs", label: "Docs", match: "my-project/docs/**", tab: "knowledge", color: "#3b82f6" },
  ],
  tabs: [
    { id: "knowledge", label: "Knowledge", icon: "book-open", default: true },
  ],
};
```

## MCP Server (Claude Code / Cursor)

```json
{
  "mcpServers": {
    "the-hub": {
      "command": "npx",
      "args": ["-y", "the-hub", "mcp"]
    }
  }
}
```

Or if installed locally via git clone:

```json
{
  "mcpServers": {
    "the-hub": {
      "command": "node",
      "args": ["/path/to/the-hub/bin/hub-mcp.js"]
    }
  }
}
```

23 tools including: `workspace_summary`, `search`, `read_artifact`, `ask_question`, `get_decisions`, `get_hygiene`, `create_doc`, `compile_context`, `meeting_brief`, `remember`, `recall`, and more.

## Interfaces

| Interface | Description |
|---|---|
| **Web UI** | 14 pages: briefing, tabs, repos, hygiene, ask, graph, decisions, settings |
| **MCP Server** | 23 tools, 4 resources, 5 prompts for AI assistants |
| **CLI** | `hub search`, `hub context`, `hub stale`, `hub status` |
| **REST API** | 60+ endpoints |
| **PWA** | Installable, works offline |

## Screenshots

<details>
<summary>View all screenshots</summary>

### Planning Tab
![Planning](docs/screenshots/planning.png)

### Document Hygiene
![Hygiene](docs/screenshots/hygiene.png)

### Universal Search (Cmd+K)
![Command Palette](docs/screenshots/command-palette.png)

### Connected Repos
![Repos](docs/screenshots/repos.png)

</details>

## Tech Stack

- **Next.js 15** (App Router, React 19, server components)
- **SQLite** (better-sqlite3, FTS5 search, vector index)
- **Tailwind CSS v4** + Radix UI
- **MCP SDK** for AI tool integration
- **chokidar** for live file watching

## Commands

```bash
npm run dev        # Dev server (Turbopack, port 9001)
npm run build      # Production build
npm start          # Production server (HTTP :9002, HTTPS :9001)
npm test           # Run tests
hub search <query> # CLI search
hub stale          # Show stale docs
```

## License

MIT

## Links

- [Landing Page](https://ahmedkhaledmohamed.github.io/the-hub/)
- [Future Developments](docs/future-developments.md)
