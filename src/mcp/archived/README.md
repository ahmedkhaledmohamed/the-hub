# Archived MCP Tools

These MCP tools were moved out of the main server registration in v5.
They still work but are not registered by default to reduce noise.

## Why archived

Per v5 audit: only 6 of 19 MCP tools are regularly used by agents.
The remaining 13 add complexity without proportional value.

## Re-enabling

Set `HUB_MCP_ALL_TOOLS=true` in your environment to register all tools.

## Archived tools

| Tool | Reason |
|---|---|
| generate_content | Low agent usage — use via API instead |
| get_hygiene | Low agent usage — visit /hygiene in browser |
| get_trends | Low agent usage — visit /status |
| list_repos | Low agent usage — visit /repos |
| get_impact | Theoretical — no measured agent invocations |
| get_errors | Debugging tool — use /api/errors directly |
| remember / recall | No adoption — agents don't persist memory |
| ask_decisions | Duplicates get_decisions functionality |
| compile_context | Low usage — use /api/context directly |
| detect_gaps | Niche — use /api/gaps directly |
| catch_up | No adoption — session tracking unused |
| meeting_brief | Low usage — use /api/meeting-brief directly |

## Core tools (kept active)

1. search
2. read_artifact
3. ask_question
4. get_manifest
5. list_groups
6. get_decisions
