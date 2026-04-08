import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const HOME = process.env.HOME || "/";

function getMcpConfigPath(): string {
  return join(HOME, ".cursor", "mcp.json");
}

function readMcpConfig(): Record<string, Record<string, unknown>> {
  const configPath = getMcpConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    const content = readFileSync(configPath, "utf-8").trim();
    if (!content) return {};
    const raw = JSON.parse(content);
    return raw.mcpServers || {};
  } catch {
    return {};
  }
}

function writeMcpConfig(servers: Record<string, Record<string, unknown>>): void {
  const configPath = getMcpConfigPath();
  const raw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf-8")) : {};
  raw.mcpServers = servers;
  writeFileSync(configPath, JSON.stringify(raw, null, 2), "utf-8");
}

/**
 * GET /api/mcp-servers — list all configured MCP servers with status
 */
export async function GET() {
  const servers = readMcpConfig();

  const result = Object.entries(servers).map(([id, config]) => ({
    id,
    disabled: config.disabled === true,
    type: config.url ? "http" : "stdio",
    url: (config.url as string) || null,
    command: (config.command as string) || null,
    cwd: (config.cwd as string) || null,
  }));

  const enabled = result.filter((s) => !s.disabled).length;
  const disabled = result.filter((s) => s.disabled).length;

  return NextResponse.json({ servers: result, total: result.length, enabled, disabled });
}

/**
 * PATCH /api/mcp-servers
 * { id: "server-name", disabled: true|false }
 */
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = body.id as string;
  const disabled = body.disabled as boolean;

  if (!id || typeof disabled !== "boolean") {
    return NextResponse.json({ error: "id (string) and disabled (boolean) required" }, { status: 400 });
  }

  const servers = readMcpConfig();
  if (!servers[id]) {
    return NextResponse.json({ error: `Unknown server: ${id}` }, { status: 404 });
  }

  if (disabled) {
    servers[id].disabled = true;
  } else {
    delete servers[id].disabled;
  }

  writeMcpConfig(servers);

  return NextResponse.json({ id, disabled, message: `${id} ${disabled ? "disabled" : "enabled"}` });
}
