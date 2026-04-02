# The Hub

A personal command center for Product Managers.

Point it at your workspace. Configure your tabs, panels, and links. It scans your files, renders your markdown, and gives you a single starting point for your daily workflow.

No personal information in this repo. Your config makes it yours.

## Quick Start

```bash
# Clone and install
git clone <your-repo-url> the-hub
cd the-hub
npm install

# Create your config
cp hub.config.example.ts hub.config.ts
# Edit hub.config.ts with your workspace paths, groups, and panels

# Run
npm run dev
# Open http://localhost:9001
```

## How It Works

The hub scans the directories you configure, groups files by pattern matching, and renders them in a tabbed interface with curated panels.

```
┌─────────────────────────────────────────────────┐
│  YOUR HUB (always running at localhost:9001)    │
│  Planning | Knowledge | Deliverables | All      │
├─────────────────────────────────────────────────┤
│  Curated Panels        │  Scanned Artifacts     │
│  (from config)         │  (from workspace)      │
│                        │                        │
│  Timeline, links,      │  866 files grouped     │
│  DoDs, tools           │  by pattern match      │
└─────────────────────────────────────────────────┘
```

### Architecture

- **Config-driven** — everything lives in `hub.config.ts` (gitignored)
- **File scanner** — walks your workspace directories, extracts titles, computes staleness
- **Markdown rendering** — `.md` files render with full formatting, syntax highlighting, and navigation
- **Content search** — search finds matches in titles, paths, and content snippets
- **Tab routing** — `/planning`, `/knowledge`, `/deliverables` are bookmarkable URLs

## Configuration

The hub is configured entirely through `hub.config.ts`. See `hub.config.example.ts` for a full annotated example.

### Workspaces

Define which directories to scan:

```typescript
workspaces: [
  { path: "~/Developer/my-project", label: "My Project" },
  { path: "~/Developer/planning-docs", label: "Planning" },
]
```

### Groups

Define how scanned files are organized. Groups use glob patterns and are assigned to tabs. First match wins.

```typescript
groups: [
  {
    id: "docs",
    label: "Documentation",
    description: "Project docs and guides",
    match: "my-project/docs/**",
    tab: "knowledge",
    color: "#4a9eff",
  },
]
```

### Tabs

Define the navigation structure:

```typescript
tabs: [
  { id: "planning", label: "Planning", icon: "calendar", default: true },
  { id: "knowledge", label: "Knowledge", icon: "book-open" },
  { id: "deliverables", label: "Deliverables", icon: "package" },
]
```

An "All" tab is always added automatically.

### Panels

Add curated links, timelines, and tools to any tab:

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
        { label: "Project Board", url: "https://...", icon: "kanban", meta: "Board" },
      ],
    },
  ],
}
```

Panel types: `timeline`, `links`, `tools`.

### Tools

External apps shown in the Deliverables tab:

```typescript
tools: [
  { label: "Dashboard", url: "https://...", icon: "bar-chart", description: "Analytics" },
]
```

## Running in Production

Build once, then start:

```bash
npm run build
npm start
```

### Always-On (macOS)

Use a LaunchAgent to keep the hub running at login:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.me.the-hub</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/path/to/the-hub/start.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/the-hub</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>~/.the-hub.log</string>
    <key>StandardErrorPath</key>
    <string>~/.the-hub.log</string>
</dict>
</plist>
```

Save to `~/Library/LaunchAgents/com.me.the-hub.plist` and load with:

```bash
launchctl load ~/Library/LaunchAgents/com.me.the-hub.plist
```

### Local Hostname Alias

To access via a friendly URL like `http://my-hub:9001`:

```bash
echo "127.0.0.1 my-hub" | sudo tee -a /etc/hosts
sudo dscacheutil -flushcache
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/manifest` | GET | Returns the scanned artifact manifest |
| `/api/regenerate` | POST | Triggers a rescan of all workspaces |
| `/api/file/[workspace]/[...path]` | GET | Serves a workspace file (markdown rendered as HTML) |

## Relationship to PM AI Partner Framework

This project is the **reference implementation** of the Personal Hub workflow from the [PM AI Partner Framework](https://ghe.spotify.net/ahmedm/pm-ai-partner-framework).

The framework defines the *methodology* — the four-phase approach (Audit → Build → Automate → Evolve) and the `/pm:personal-hub` skill that guides AI to help you build a hub. **the-hub** is the production-quality product that embodies that methodology.

| Layer | What | Where |
|-------|-------|-------|
| **Methodology** | Why to build a hub, what phases to follow, how to audit your context | [PM AI Partner Framework](https://ghe.spotify.net/ahmedm/pm-ai-partner-framework) — `framework/core/workflows/personal-hub.md` |
| **AI Skill** | Prompt an AI agent to help you build/maintain your hub | [PM AI Partner Framework](https://ghe.spotify.net/ahmedm/pm-ai-partner-framework) — `plugin/skills/personal-hub/` |
| **Product** | The actual running hub — config-driven, file-scanning, always-on | This repo |

The framework's Personal Hub workflow starts with a minimal single-HTML approach for getting a v1 running in 30 minutes. This repo takes that further with a full Next.js app for config-driven tabs, SSR, content search, and a file watcher — the natural evolution when the hub becomes a daily-driver tool.

## Tech Stack

- Next.js 15 with App Router
- Tailwind CSS v4
- Lucide icons
- `marked` + `highlight.js` for markdown rendering
- `minimatch` for glob pattern matching
- `chokidar` for filesystem watching

## Project Structure

```
the-hub/
  src/
    app/
      layout.tsx              # Shell: sidebar + main area
      page.tsx                # Redirects to default tab
      [tab]/page.tsx          # Dynamic tab page
      api/                    # Manifest, file serving, regenerate
    components/
      panels/                 # Timeline, links, tools panels
      artifacts/              # Grid, card, preview components
      layout/                 # Sidebar, search bar
    lib/
      types.ts                # All TypeScript types
      config.ts               # Config loader
      scanner.ts              # Filesystem scanner
      markdown.ts             # Markdown renderer
    hooks/
      use-manifest.ts         # Client-side manifest fetching
  hub.config.example.ts       # Annotated example config
  hub.config.ts               # Your personal config (gitignored)
  start.sh                    # Production start script
```
