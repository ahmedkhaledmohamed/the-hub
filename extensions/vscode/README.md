# The Hub — VS Code Extension

Workspace intelligence from [The Hub](https://github.com/ahmedkhaledmohamed/the-hub) in your editor sidebar.

## What it shows (things Cursor doesn't have)

- **Workspace Health** — freshness %, stale doc count, quality score, group overview
- **Hygiene Issues** — duplicate docs, near-duplicates, stale files, similar titles
- **Active Decisions** — decisions tracked from your documents with status
- **Recently Changed** — docs modified in the last 7 days
- **Cross-workspace Search** — search across ALL Hub workspaces, not just the open folder
- **Status Bar** — quality score + staleness indicator at a glance

## What it does NOT do (Cursor already has these)

- File search (Cmd+P)
- Git integration (built-in)
- AI chat (Claude/GPT)
- MCP tool consumption
- Code intelligence (LSP)

## Setup

1. Start The Hub: `cd the-hub && npm start`
2. Install the extension (from VSIX or dev mode)
3. The sidebar panel appears automatically

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `theHub.serverUrl` | `http://localhost:9002` | Hub server URL |
| `theHub.refreshInterval` | `60` | Auto-refresh interval in seconds (0 to disable) |

## Development

```bash
cd extensions/vscode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```
