# The Hub

A personal command center that gives you one place to find, preview, and navigate your workspace — from your browser or directly inside Cursor.

Point it at your directories. It scans your files, groups them by pattern, renders your markdown, and surfaces everything in a tabbed interface with curated panels, timelines, and links. No personal information in this repo — your config makes it yours.

## Why

As a PM (or anyone juggling many repos, docs, and tools), context is scattered:
- Strategy docs in one repo, code in another, dashboards elsewhere
- Bookmarks rot, browser tabs multiply, files go stale without anyone noticing
- Switching between tools costs attention

The Hub solves this by giving you a **single starting point** — always running, always current — that indexes your workspace and sends you to the right place with context.

## What It Does

- **Scans directories** you configure and builds a searchable catalog of artifacts (markdown, HTML, SVG, CSV)
- **Groups files by pattern** into tabs — Planning, Knowledge, Deliverables, or whatever structure fits your work
- **Renders markdown** with syntax highlighting, in a side-panel preview or full page
- **Curated panels** — timelines, link collections, and tool launchers alongside your scanned content
- **Full-text search** across titles, paths, and content snippets (Cmd+K command palette)
- **Live file watching** — changes in your workspace auto-update the manifest within seconds
- **Context launchers** — open any artifact in Cursor, copy the terminal `cd` command, or grab the absolute path
- **AI toolkit dashboard** — if connected to [PM AI Partner Framework](https://github.com/your-username/pm-ai-partner-framework), shows installed skills, configured MCPs, and slash commands
- **Always on** — runs as a macOS LaunchAgent, survives reboots, auto-restarts on crashes

## Install

### One-Line Setup

```bash
git clone <your-repo-url> the-hub && cd the-hub && bash setup.sh
```

The setup script walks you through everything interactively:
1. Installs dependencies
2. Creates `hub.config.ts` from the example template
3. Builds the production bundle
4. (Optional) Sets up HTTPS with `mkcert` and a local hostname
5. (Optional) Installs a macOS LaunchAgent for always-on operation
6. (Optional) Builds and installs the Cursor extension

### Manual Setup

```bash
git clone <your-repo-url> the-hub
cd the-hub
npm install

# Create your config
cp hub.config.example.ts hub.config.ts
# Edit hub.config.ts — add your workspace paths, groups, tabs, and panels

# Build and run
npm run build
npm start
# Open http://localhost:9002
```

### Cursor Extension

The Hub includes a Cursor/VS Code extension that adds:
- A **Hub** tab in the bottom panel (alongside Terminal, Output, etc.) with server status
- **Cmd+Shift+H** to open the hub as a full editor tab
- The hub renders inside Cursor via WebView — no browser needed

To install separately:

```bash
cd extension
npm install && npm run build
npx @vscode/vsce package --no-dependencies
cursor --install-extension the-hub-0.1.0.vsix --force
# Reload Cursor: Cmd+Shift+P → "Developer: Reload Window"
```

### HTTPS (Optional)

For a trusted `https://my-hub:9001` URL in the browser:

```bash
brew install mkcert
mkcert -install
mkdir -p certs && cd certs && mkcert my-hub localhost 127.0.0.1
echo "127.0.0.1 my-hub" | sudo tee -a /etc/hosts
```

The server auto-detects certs and serves HTTPS on port 9001 alongside HTTP on port 9002.

### Always-On (macOS)

The setup script can install this for you, or manually:

```bash
# Edit start.sh with your paths, then:
cp start.sh.example start.sh && chmod +x start.sh

# Create ~/Library/LaunchAgents/com.hub.the-hub.plist (see setup.sh for template)
launchctl load ~/Library/LaunchAgents/com.hub.the-hub.plist
```

The hub starts at login and auto-restarts if it crashes. Logs go to `~/.the-hub.log`.

## Configuration

Everything lives in `hub.config.ts` (gitignored). See `hub.config.example.ts` for a full annotated example.

### Workspaces

Directories to scan for artifacts:

```typescript
workspaces: [
  { path: "~/Developer/my-project", label: "My Project" },
  { path: "~/Developer/docs", label: "Documentation" },
]
```

### Groups

How scanned files are organized. Groups use glob patterns and are assigned to tabs. First match wins.

```typescript
groups: [
  {
    id: "strategy",
    label: "Strategy",
    match: "my-project/strategy/**",
    tab: "planning",
    color: "#3b82f6",
  },
]
```

### Tabs

Navigation structure:

```typescript
tabs: [
  { id: "planning", label: "Planning", icon: "calendar", default: true },
  { id: "knowledge", label: "Knowledge", icon: "book-open" },
  { id: "deliverables", label: "Deliverables", icon: "package" },
]
```

An "All" tab is always added automatically.

### Panels

Curated content alongside your scanned artifacts:

```typescript
panels: {
  planning: [
    {
      type: "timeline",
      title: "Key Dates",
      badge: { text: "Live", color: "green" },
      items: [
        { date: "Jan 15", text: "Kickoff", status: "past" },
        { date: "Feb 1", text: "Submit proposals", status: "active" },
      ],
    },
    {
      type: "links",
      title: "Quick Links",
      items: [
        { label: "Board", url: "https://...", icon: "kanban", meta: "Jira" },
      ],
    },
  ],
}
```

Panel types: `timeline`, `links`, `tools`.

### Framework Integration

Connect to the [PM AI Partner Framework](https://github.com/your-username/pm-ai-partner-framework) for an AI toolkit dashboard:

```typescript
framework: {
  path: "~/Developer/pm-ai-partner-framework",
  tab: "ai-tools",
}
```

This parses the framework repo and renders:
- **Health summary** — version, install counts, freshness
- **Skill catalog** — all skills with install status across Cursor, Claude, and Codex
- **MCP catalog** — servers grouped by tier, with configuration status
- **Slash commands** — available `/pm:*` commands

## How It Works

```
┌────────────────────────────────────────────────────┐
│  THE HUB                                           │
│  Planning │ Knowledge │ Deliverables │ AI Tools     │
├────────────────────┬───────────────────────────────┤
│  Curated Panels    │  Scanned Artifacts            │
│                    │                               │
│  ▸ Timeline        │  1,028 files across           │
│  ▸ Links           │  2 workspaces, grouped        │
│  ▸ DoDs            │  by glob patterns             │
│  ▸ AI Toolkit      │                               │
│                    │  Cmd+K search │ Preview panel  │
└────────────────────┴───────────────────────────────┘
     ▲                         ▲
     │                         │
  hub.config.ts          File scanner + chokidar
  (your config)          (watches workspace dirs)
```

### Architecture

- **Config-driven** — all content, structure, and behavior defined in `hub.config.ts`
- **Server-side rendering** — tab pages use `force-dynamic` for instant loads, no flash
- **File watcher** — `chokidar` watches workspaces and regenerates the manifest on changes (5s debounce)
- **Config hot-reload** — changes to `hub.config.ts` trigger a manifest regeneration without restart
- **Dual-port server** — HTTPS on 9001 (browser) + HTTP on 9002 (Cursor extension WebView)
- **Markdown rendering** — `marked` + `highlight.js` with dark theme, all links open in new tabs
- **State persistence** — last tab, collapsed sections, recent searches survive page reloads via localStorage

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/manifest` | GET | Scanned artifact manifest (groups, artifacts, metadata) |
| `/api/regenerate` | POST | Trigger a rescan of all workspaces |
| `/api/file/[...path]` | GET | Serve a workspace file (markdown rendered as styled HTML) |
| `/api/framework` | GET | Parsed PM AI Partner Framework catalog |
| `/api/resolve?path=...` | GET | Resolve artifact path to absolute filesystem path |

## Connecting to Other Tools

The Hub is a **launchpad**, not a dashboard. It knows what exists and where, then sends you to the right tool with context.

| Integration | How | What You Get |
|---|---|---|
| **Cursor** | Extension (WebView + Cmd+Shift+H) | Hub inside your editor |
| **PM AI Partner Framework** | `framework.path` in config | Skill/MCP/command catalog with install status |
| **PM OS Workspace** | Add as a workspace in config | Scanned and grouped alongside your other docs |
| **Any repo/directory** | Add to `workspaces` array | Auto-scanned, grouped, searchable |
| **External tools** | `panels.links` or `tools` array | One-click links to boards, dashboards, Slack channels |
| **mkcert** | `certs/` directory | Trusted HTTPS with custom hostname |

## Project Structure

```
the-hub/
├── hub.config.example.ts    # Annotated config template (committed)
├── hub.config.ts            # Your personal config (gitignored)
├── server.mjs               # Dual-port HTTPS + HTTP server
├── start.sh                 # LaunchAgent entry point
├── setup.sh                 # Interactive setup script
├── extension/               # Cursor/VS Code extension
│   ├── src/extension.ts     # WebView panel + editor tab
│   ├── resources/hub.svg    # Activity bar icon
│   └── package.json         # Extension manifest
└── src/
    ├── app/
    │   ├── [tab]/page.tsx   # Dynamic server component per tab
    │   └── api/             # Manifest, file serving, framework, resolve
    ├── components/
    │   ├── layout/          # Sidebar, command palette (Cmd+K)
    │   ├── panels/          # Timeline, links, tools renderers
    │   ├── artifacts/       # Grid, card, preview, launcher actions
    │   └── framework/       # Skill catalog, MCP catalog, health
    └── lib/
        ├── config.ts        # Config loader with hot-reload
        ├── scanner.ts       # Filesystem walker + pattern matcher
        ├── manifest-store.ts # Singleton cache + chokidar watcher
        ├── framework.ts     # PM AI Partner Framework parser
        ├── markdown.ts      # marked + highlight.js renderer
        └── types.ts         # All TypeScript interfaces
```

## Tech Stack

- **Next.js 15** with App Router and Turbopack (dev)
- **React 19** with server components
- **Tailwind CSS v4** + shadcn/ui primitives
- **marked** + **highlight.js** for markdown
- **chokidar** for filesystem watching
- **minimatch** for glob pattern matching
- **mkcert** for local HTTPS (optional)

## Commands

```bash
npm run dev        # Dev server with Turbopack (localhost:9001)
npm run build      # Production build
npm start          # Production server (HTTPS :9001 + HTTP :9002)
npm run typecheck  # TypeScript check
npm run lint       # ESLint
bash setup.sh      # Interactive setup (deps, config, HTTPS, LaunchAgent, extension)
```
