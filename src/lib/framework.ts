import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type {
  FrameworkCatalog,
  FrameworkSkill,
  McpServerEntry,
  FrameworkCommand,
  FrameworkHealth,
  McpTier,
} from "./types";
import { loadConfig } from "./config";

let cached: FrameworkCatalog | null = null;
let cachedAt = 0;
const TTL_MS = 60_000;

function resolveHome(p: string): string {
  if (p.startsWith("~/")) {
    return join(process.env.HOME || "/", p.slice(2));
  }
  return p;
}

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

function readSkills(frameworkPath: string): FrameworkSkill[] {
  const skillsDir = join(frameworkPath, "plugin/skills");
  if (!existsSync(skillsDir)) return [];

  const home = process.env.HOME || "/";
  const cursorSkills = join(home, ".cursor/skills");
  const claudeSkills = join(home, ".claude/skills");
  const codexSkills = join(home, ".codex/skills");

  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );

  const skills: FrameworkSkill[] = [];
  for (const d of dirs) {
    const skillFile = join(skillsDir, d.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    const content = readFileSync(skillFile, "utf-8");
    const fm = parseYamlFrontmatter(content);
    skills.push({
      id: d.name,
      name: fm.name || d.name,
      description: fm.description || "",
      argumentHint: fm["argument-hint"],
      allowedTools: fm["allowed-tools"],
      installed: {
        cursor: existsSync(join(cursorSkills, d.name, "SKILL.md")),
        claude: existsSync(join(claudeSkills, d.name, "SKILL.md")),
        codex: existsSync(join(codexSkills, d.name, "SKILL.md")),
      },
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function readMcpCatalog(
  frameworkPath: string,
): { servers: McpServerEntry[]; tiers: Record<string, McpTier> } {
  const catalogFile = join(frameworkPath, "plugin/mcp/catalog.json");
  if (!existsSync(catalogFile))
    return { servers: [], tiers: {} };

  const raw = JSON.parse(readFileSync(catalogFile, "utf-8"));
  const tiers: Record<string, McpTier> = raw.tiers || {};

  const configuredIds = getConfiguredMcpIds();

  const servers: McpServerEntry[] = (raw.servers || []).map(
    (s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      description: s.description as string,
      tier: s.tier as string,
      tierLabel: tiers[s.tier as string]?.label || (s.tier as string),
      transport: s.transport as "stdio" | "url",
      pmUseCase: s.pmUseCase as string,
      needsCredentials:
        Array.isArray(s.credentials) && (s.credentials as unknown[]).length > 0,
      configured: configuredIds.has(s.id as string),
    }),
  );

  return { servers, tiers };
}

function getConfiguredMcpIds(): Set<string> {
  const ids = new Set<string>();
  const home = process.env.HOME || "/";
  const paths = [
    join(home, ".cursor/mcp.json"),
    join(home, ".claude/mcp.json"),
    ".cursor/mcp.json",
    ".claude/mcp.json",
  ];

  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      const data = JSON.parse(readFileSync(p, "utf-8"));
      const servers = data.mcpServers || data.servers || data;
      if (typeof servers === "object" && servers !== null) {
        for (const key of Object.keys(servers)) {
          ids.add(key.replace(/-/g, "").toLowerCase());
          ids.add(key);
        }
      }
    } catch {
      // ignore malformed files
    }
  }
  return ids;
}

function readCommands(frameworkPath: string): FrameworkCommand[] {
  const cmdsDir = join(frameworkPath, "plugin/commands/pm");
  if (!existsSync(cmdsDir)) return [];

  return readdirSync(cmdsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = readFileSync(join(cmdsDir, f), "utf-8");
      const firstLine = content.split("\n")[0] || "";
      return {
        id: basename(f, ".md"),
        name: `/pm:${basename(f, ".md")}`,
        firstLine: firstLine
          .replace("$ARGUMENTS", "<topic>")
          .trim(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readHealth(
  frameworkPath: string,
  skills: FrameworkSkill[],
  mcpServers: McpServerEntry[],
): FrameworkHealth {
  let version = "unknown";
  try {
    const pluginJson = join(frameworkPath, "plugin/.claude-plugin/plugin.json");
    if (existsSync(pluginJson)) {
      const data = JSON.parse(readFileSync(pluginJson, "utf-8"));
      version = data.version || version;
    }
  } catch {
    // ignore
  }

  let lastCommitDate = "unknown";
  try {
    const gitDir = join(frameworkPath, ".git");
    if (existsSync(gitDir)) {
      for (const ref of ["FETCH_HEAD", "HEAD", "index"]) {
        const refPath = join(gitDir, ref);
        if (existsSync(refPath)) {
          const stat = statSync(refPath);
          lastCommitDate = stat.mtime.toISOString();
          break;
        }
      }
    }
  } catch {
    // ignore
  }

  const installedCount = skills.filter(
    (s) => s.installed.cursor || s.installed.claude || s.installed.codex,
  ).length;
  const configuredCount = mcpServers.filter((m) => m.configured).length;

  return {
    version,
    skillsInstalled: installedCount,
    skillsTotal: skills.length,
    mcpsConfigured: configuredCount,
    mcpsTotal: mcpServers.length,
    lastCommitDate,
    repoPath: frameworkPath,
  };
}

export function loadFrameworkCatalog(): FrameworkCatalog | null {
  const config = loadConfig();
  if (!config.framework?.path) return null;

  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const frameworkPath = resolveHome(config.framework.path);
  if (!existsSync(frameworkPath)) return null;

  const skills = readSkills(frameworkPath);
  const { servers, tiers } = readMcpCatalog(frameworkPath);
  const commands = readCommands(frameworkPath);
  const health = readHealth(frameworkPath, skills, servers);

  cached = { skills, mcpServers: servers, commands, health, tiers };
  cachedAt = Date.now();
  return cached;
}

export function invalidateFrameworkCache(): void {
  cached = null;
  cachedAt = 0;
}
