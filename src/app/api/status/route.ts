import { NextResponse } from "next/server";
import { getDb, getArtifactCount } from "@/lib/db";
import { getAiConfig, isAiConfigured, isOllamaDetected } from "@/lib/ai-client";
import { loadConfig } from "@/lib/config";
import { statSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

export interface SystemStatus {
  server: {
    uptime: number;
    startedAt: string;
    nodeVersion: string;
    platform: string;
  };
  database: {
    artifactCount: number;
    dbSizeBytes: number;
    tables: Array<{ name: string; rowCount: number }>;
  };
  scan: {
    lastScanReason: string | null;
    artifactCount: number;
    workspaces: Array<{ path: string; label: string }>;
  };
  ai: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    ollamaDetected: boolean;
  };
  integrations: Array<{
    name: string;
    configured: boolean;
    envVar: string;
  }>;
  jobs: {
    pending: number;
    running: number;
    failed: number;
    completed: number;
  };
  features: {
    total: number;
    available: number;
    list: Array<{ name: string; available: boolean }>;
  };
}

/**
 * GET /api/status — full system health dashboard data
 */
export async function GET() {
  const config = loadConfig();
  const db = getDb();

  // Server info
  const server = {
    uptime: Math.round((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
  };

  // Database info
  const artifactCount = getArtifactCount();
  let dbSizeBytes = 0;
  try {
    const dbPath = join(process.cwd(), ".hub-data", "hub.db");
    dbSizeBytes = statSync(dbPath).size;
  } catch { /* db file may not exist at expected path */ }

  const tables: Array<{ name: string; rowCount: number }> = [];
  try {
    const tableNames = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as Array<{ name: string }>;
    for (const t of tableNames) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number };
        tables.push({ name: t.name, rowCount: row.count });
      } catch {
        tables.push({ name: t.name, rowCount: -1 });
      }
    }
  } catch { /* empty db */ }

  // Scan info
  let lastScanReason: string | null = null;
  try {
    const { getManifest } = await import("@/lib/manifest-store");
    const manifest = getManifest();
    lastScanReason = (manifest as unknown as Record<string, unknown>).lastScanReason as string || null;
  } catch { /* manifest not available */ }

  // AI info
  const aiConfig = getAiConfig();
  let provider: string | null = null;
  if (aiConfig) {
    if (aiConfig.gatewayUrl.includes("anthropic")) provider = "Anthropic";
    else if (aiConfig.gatewayUrl.includes("openai")) provider = "OpenAI";
    else if (aiConfig.gatewayUrl.includes("localhost:11434")) provider = "Ollama (local)";
    else provider = "Custom API";
  }

  // Integrations
  const integrations = [
    { name: "Slack", configured: !!process.env.SLACK_WEBHOOK_URL, envVar: "SLACK_WEBHOOK_URL" },
    { name: "Google Docs", configured: !!(process.env.GOOGLE_DOCS_API_KEY || process.env.GOOGLE_DOCS_TOKEN), envVar: "GOOGLE_DOCS_API_KEY" },
    { name: "Notion", configured: !!process.env.NOTION_TOKEN, envVar: "NOTION_TOKEN" },
    { name: "Calendar", configured: !!process.env.CALENDAR_URL, envVar: "CALENDAR_URL" },
    { name: "SSO/SAML", configured: process.env.SSO_ENABLED === "true", envVar: "SSO_ENABLED" },
  ];

  // Job queue
  const jobs = { pending: 0, running: 0, failed: 0, completed: 0 };
  try {
    const rows = db.prepare(
      "SELECT status, COUNT(*) as count FROM jobs GROUP BY status"
    ).all() as Array<{ status: string; count: number }>;
    for (const r of rows) {
      if (r.status in jobs) jobs[r.status as keyof typeof jobs] = r.count;
    }
  } catch { /* jobs table may not exist */ }

  // Feature availability
  const aiOn = isAiConfigured();
  const featureList = [
    { name: "Full-text search (FTS5)", available: true },
    { name: "Document hygiene", available: true },
    { name: "Knowledge graph", available: true },
    { name: "Change feed", available: true },
    { name: "MCP server (9 tools)", available: true },
    { name: "Git repo discovery", available: true },
    { name: "RAG Q&A", available: aiOn },
    { name: "Summarization", available: aiOn },
    { name: "Content generation", available: aiOn },
    { name: "Smart triage", available: aiOn },
    { name: "Predictive briefing", available: aiOn },
    { name: "Decision extraction (AI)", available: aiOn },
  ];

  const status: SystemStatus = {
    server,
    database: { artifactCount, dbSizeBytes, tables },
    scan: {
      lastScanReason,
      artifactCount,
      workspaces: (config.workspaces || []).map((w) => ({ path: w.path, label: w.label })),
    },
    ai: {
      configured: aiOn,
      provider,
      model: aiConfig?.model || null,
      ollamaDetected: isOllamaDetected(),
    },
    integrations,
    jobs,
    features: {
      total: featureList.length,
      available: featureList.filter((f) => f.available).length,
      list: featureList,
    },
  };

  return NextResponse.json(status);
}
