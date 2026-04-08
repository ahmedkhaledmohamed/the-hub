import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const HOME = process.env.HOME || "/";
const CURSOR_MCP_PATH = join(HOME, ".cursor", "mcp.json");
const CLAUDE_MCP_PATH = join(HOME, ".claude", "settings.json");

interface McpServerEntry {
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

function readCursorConfig(): McpConfig {
  if (!existsSync(CURSOR_MCP_PATH)) return { mcpServers: {} };
  return JSON.parse(readFileSync(CURSOR_MCP_PATH, "utf-8"));
}

function readClaudeConfig(): { mcpServers?: Record<string, McpServerEntry> } {
  if (!existsSync(CLAUDE_MCP_PATH)) return {};
  const data = JSON.parse(readFileSync(CLAUDE_MCP_PATH, "utf-8"));
  return { mcpServers: data.mcpServers || {} };
}

function getServerType(entry: McpServerEntry): "stdio" | "url" {
  return entry.command ? "stdio" : "url";
}

function getCacheStatus(serverId: string): "ok" | "errored" | "no-tools" | "uncached" {
  const projectsDir = join(HOME, ".cursor", "projects");
  if (!existsSync(projectsDir)) return "uncached";

  let cacheDir: string | null = null;
  try {
    const projects = readdirSync(projectsDir);
    for (const proj of projects) {
      const candidate = join(projectsDir, proj, "mcps", `user-${serverId}`);
      if (existsSync(candidate)) { cacheDir = candidate; break; }
    }
  } catch { return "uncached"; }

  if (!cacheDir) return "uncached";

  const statusPath = join(cacheDir, "STATUS.md");
  if (existsSync(statusPath)) {
    const content = readFileSync(statusPath, "utf-8");
    if (content.toLowerCase().includes("error")) return "errored";
  }

  const toolsDir = join(cacheDir, "tools");
  if (!existsSync(toolsDir)) return "no-tools";

  try {
    const files = readdirSync(toolsDir).filter((f: string) => f.endsWith(".json"));
    if (files.length === 0) return "no-tools";
    if (files.length === 1 && files[0] === "mcp_auth.json") return "no-tools";
  } catch {
    return "no-tools";
  }

  return "ok";
}

function getToolCount(serverId: string): number {
  const projectsDir = join(HOME, ".cursor", "projects");
  if (!existsSync(projectsDir)) return 0;

  try {
    const projects = readdirSync(projectsDir);
    for (const proj of projects) {
      const toolsDir = join(projectsDir, proj, "mcps", `user-${serverId}`, "tools");
      if (existsSync(toolsDir)) {
        return readdirSync(toolsDir).filter((f: string) => f.endsWith(".json")).length;
      }
    }
  } catch { /* ignore */ }
  return 0;
}

export async function GET() {
  const cursorConfig = readCursorConfig();
  const claudeConfig = readClaudeConfig();

  const servers = Object.entries(cursorConfig.mcpServers).map(([id, entry]) => {
    const inClaude = id in (claudeConfig.mcpServers || {});
    return {
      id,
      type: getServerType(entry),
      url: entry.url || null,
      command: entry.command || null,
      cwd: entry.cwd || null,
      disabled: entry.disabled || false,
      cacheStatus: entry.disabled ? "disabled" : getCacheStatus(id),
      toolCount: getToolCount(id),
      inClaude,
    };
  });

  servers.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  const enabledCount = servers.filter((s) => !s.disabled).length;
  const disabledCount = servers.filter((s) => s.disabled).length;
  const totalTools = servers.filter((s) => !s.disabled).reduce((sum, s) => sum + s.toolCount, 0);

  return NextResponse.json({
    servers,
    summary: { total: servers.length, enabled: enabledCount, disabled: disabledCount, totalTools },
    paths: { cursor: CURSOR_MCP_PATH, claude: CLAUDE_MCP_PATH },
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, disabled } = body as { id: string; disabled: boolean };

  if (!id || typeof disabled !== "boolean") {
    return NextResponse.json({ error: "id (string) and disabled (boolean) required" }, { status: 400 });
  }

  const config = readCursorConfig();
  if (!(id in config.mcpServers)) {
    return NextResponse.json({ error: `Server "${id}" not found` }, { status: 404 });
  }

  if (disabled) {
    config.mcpServers[id].disabled = true;
  } else {
    delete config.mcpServers[id].disabled;
  }

  writeFileSync(CURSOR_MCP_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

  return NextResponse.json({ id, disabled, message: `Server "${id}" ${disabled ? "disabled" : "enabled"}. Restart Cursor to apply.` });
}
