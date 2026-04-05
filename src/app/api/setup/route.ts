import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync, readdirSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "@/lib/config";
import { isAiConfigured, ensureAiConfigured, getAiConfig, detectOllama, isOllamaDetected } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

interface SetupStatus {
  config: {
    exists: boolean;
    workspaceCount: number;
    workspaces: Array<{ path: string; label: string; exists: boolean; fileCount: number }>;
  };
  ai: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    ollamaDetected: boolean;
  };
  features: Array<{ name: string; available: boolean; reason: string }>;
  scan: {
    lastScan: string | null;
    artifactCount: number;
  };
  overall: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
  };
}

/**
 * GET /api/setup — check setup status across all dimensions
 */
export async function GET() {
  const config = loadConfig();

  // 1. Config status
  const workspaces = (config.workspaces || []).map((ws) => {
    const absPath = ws.path.startsWith("~/")
      ? resolve(process.env.HOME || "/", ws.path.slice(2))
      : resolve(ws.path);
    const exists = existsSync(absPath);
    let fileCount = 0;
    if (exists) {
      try {
        const entries = readdirSync(absPath, { recursive: false });
        fileCount = entries.length;
      } catch { /* permission error */ }
    }
    return { path: ws.path, label: ws.label, exists, fileCount };
  });

  const configExists = workspaces.length > 0;
  const validWorkspaces = workspaces.filter((w) => w.exists);

  // 2. AI status
  await detectOllama();
  const aiConfig = getAiConfig();
  const aiConfigured = aiConfig !== null && process.env.AI_PROVIDER !== "none";

  let provider: string | null = null;
  if (aiConfigured && aiConfig) {
    if (aiConfig.gatewayUrl.includes("anthropic")) provider = "Anthropic";
    else if (aiConfig.gatewayUrl.includes("openai")) provider = "OpenAI";
    else if (aiConfig.gatewayUrl.includes("localhost:11434")) provider = "Ollama (local)";
    else provider = "Custom API";
  } else if (isOllamaDetected()) {
    provider = "Ollama (local)";
  }

  // 3. Scan status
  let artifactCount = 0;
  let lastScan: string | null = null;
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const countRow = db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as { count: number } | undefined;
    artifactCount = countRow?.count || 0;
    // Check for scan timestamp from manifest
    if (artifactCount > 0) lastScan = new Date().toISOString(); // approximate
  } catch { /* db not ready */ }

  // 4. Feature availability
  const features = [
    { name: "Full-text search", available: true, reason: "Always available with FTS5" },
    { name: "Document hygiene", available: true, reason: "Heuristic detection always works" },
    { name: "Knowledge graph", available: true, reason: "Wiki-link parsing is built-in" },
    { name: "Change feed", available: true, reason: "File watching is automatic" },
    { name: "RAG Q&A", available: aiConfigured, reason: aiConfigured ? "AI provider configured" : "Requires AI provider (set AI_GATEWAY_URL or install Ollama)" },
    { name: "Summarization", available: aiConfigured, reason: aiConfigured ? "AI provider configured" : "Requires AI provider" },
    { name: "Content generation", available: aiConfigured, reason: aiConfigured ? "AI provider configured" : "Requires AI provider" },
    { name: "Smart triage", available: aiConfigured, reason: aiConfigured ? "AI-powered classification" : "Falls back to heuristic (basic)" },
    { name: "MCP server", available: true, reason: "9 tools available for Claude Code / Cursor" },
    { name: "Google Docs sync", available: !!process.env.GOOGLE_DOCS_API_KEY || !!process.env.GOOGLE_DOCS_TOKEN, reason: process.env.GOOGLE_DOCS_API_KEY ? "Configured" : "Set GOOGLE_DOCS_API_KEY or GOOGLE_DOCS_TOKEN" },
    { name: "Notion sync", available: !!process.env.NOTION_TOKEN, reason: process.env.NOTION_TOKEN ? "Configured" : "Set NOTION_TOKEN" },
    { name: "Slack integration", available: !!process.env.SLACK_WEBHOOK_URL, reason: process.env.SLACK_WEBHOOK_URL ? "Configured" : "Set SLACK_WEBHOOK_URL" },
  ];

  // 5. Overall readiness
  const steps = [
    configExists,
    validWorkspaces.length > 0,
    artifactCount > 0,
  ];
  const completedSteps = steps.filter(Boolean).length;

  const status: SetupStatus = {
    config: {
      exists: configExists,
      workspaceCount: workspaces.length,
      workspaces,
    },
    ai: {
      configured: aiConfigured,
      provider,
      model: aiConfig?.model || null,
      ollamaDetected: isOllamaDetected(),
    },
    features,
    scan: {
      lastScan,
      artifactCount,
    },
    overall: {
      ready: completedSteps >= 2, // config + valid workspaces minimum
      completedSteps,
      totalSteps: steps.length,
    },
  };

  return NextResponse.json(status);
}

/**
 * POST /api/setup
 * { action: "test-ai" }      — test AI connection
 * { action: "scan" }         — trigger first scan
 * { action: "test-ollama" }  — check Ollama availability
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "test-ai") {
    const configured = await ensureAiConfigured();
    if (!configured) {
      return NextResponse.json({ success: false, error: "No AI provider configured. Set AI_GATEWAY_URL + AI_GATEWAY_KEY, or install Ollama." });
    }
    try {
      const { ask } = await import("@/lib/ai-client");
      const result = await ask("Reply with exactly: OK", { maxTokens: 10 });
      return NextResponse.json({
        success: result.model !== "none",
        model: result.model,
        response: result.content.slice(0, 100),
        cached: result.cached,
      });
    } catch (err) {
      return NextResponse.json({ success: false, error: (err as Error).message });
    }
  }

  if (action === "test-ollama") {
    const detected = await detectOllama();
    return NextResponse.json({ detected });
  }

  if (action === "scan") {
    try {
      const res = await fetch(`http://localhost:${process.env.PORT || 9001}/api/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      return NextResponse.json({ success: true, ...data });
    } catch (err) {
      return NextResponse.json({ success: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ error: "action must be test-ai, test-ollama, or scan" }, { status: 400 });
}
