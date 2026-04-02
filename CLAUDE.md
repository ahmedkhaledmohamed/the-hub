# CLAUDE.md

This is **the-hub** — a config-driven personal command center built with Next.js 15.

## Quick Reference

```bash
npm run dev          # Dev server on localhost:9001 (Turbopack)
npm run build        # Production build
npm start            # Production server on localhost:9001
npm run typecheck    # TypeScript check
```

## Architecture

- **Config-driven**: All content lives in `hub.config.ts` (gitignored). See `hub.config.example.ts` for the schema.
- **Server-side rendering**: Tab pages use `force-dynamic` — manifest is fetched server-side, no loading flash.
- **File watcher**: Chokidar watches configured workspaces and auto-regenerates the manifest on file changes (5s debounce).
- **Webpack alias**: Config is loaded via `@hub-config` alias (set in `next.config.ts`), resolved by TypeScript via `tsconfig.json` paths.

## Key Directories

```
src/
  app/
    [tab]/page.tsx       # Dynamic server component — fetches manifest, passes to TabContent
    [tab]/tab-content.tsx # Client component — search, preview, artifact grids
    api/manifest/         # GET manifest JSON
    api/regenerate/       # POST to trigger rescan
    api/file/[...path]/   # Serve workspace files (markdown rendered as HTML)
  components/
    layout/               # Sidebar (collapsible, Cmd+B), command palette (Cmd+K)
    panels/               # Timeline, links, tools panel renderers
    artifacts/            # Grid (with subdirectory hierarchy), card, preview
    providers/            # HubProvider context for global config access
  hooks/
    use-persisted-state   # localStorage-backed state persistence
    use-recent-artifacts  # Track recently opened artifacts
  lib/
    config.ts             # Loads hub.config.ts via @hub-config alias
    scanner.ts            # Walks workspaces, extracts titles/snippets, assigns groups
    manifest-store.ts     # Singleton manifest cache + chokidar watcher
    markdown.ts           # marked + highlight.js renderer
    types.ts              # All TypeScript interfaces
```

## Config Schema

The hub is entirely configured through `hub.config.ts`:

- **workspaces**: Directories to scan (`{ path, label }`)
- **groups**: Glob-based file grouping with tab assignment (`{ id, label, match, tab, color }`)
- **tabs**: Navigation structure (`{ id, label, icon, default? }`)
- **panels**: Curated content per tab — timeline, links, or tools
- **tools**: External app shortcuts
- **scanner**: Extensions, skip dirs/paths, snippet length

## Rules

- `hub.config.ts` is **gitignored** — it contains personal data. Never commit it.
- `hub.config.example.ts` is the public template — keep it generic.
- All panel types: `timeline`, `links`, `tools`.
- Artifact types: `html`, `md`, `svg`, `csv`.
- Groups use `minimatch` glob patterns. First match wins — order matters.
- The manifest includes `lastScanReason` for debugging (`startup`, `file changed: X`, `manual`).

## Testing Changes

After modifying the codebase:

```bash
npm run build          # Verify clean compile
npm start              # Start and check localhost:9001
curl -s http://localhost:9001/api/manifest | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"artifacts\"])} artifacts, {len(d[\"groups\"])} groups')"
```
