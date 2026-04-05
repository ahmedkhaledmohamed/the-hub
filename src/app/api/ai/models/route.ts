import { NextRequest, NextResponse } from "next/server";
import {
  getProviderSummary,
  getConfiguredProviders,
  listModels,
  checkProviderHealth,
  multiComplete,
  KNOWN_MODELS,
} from "@/lib/multi-model";
import type { ProviderName } from "@/lib/multi-model";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/models                        — list all providers + models
 * GET /api/ai/models?provider=<name>        — models for a specific provider
 * GET /api/ai/models?health=true            — provider health check
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") as ProviderName | null;
  const health = req.nextUrl.searchParams.get("health");

  if (health === "true") {
    const providers = getConfiguredProviders();
    const checks = await Promise.all(providers.map((p) => checkProviderHealth(p.name)));
    return NextResponse.json({ providers: checks });
  }

  if (provider) {
    const models = await listModels(provider);
    return NextResponse.json({ provider, models });
  }

  return NextResponse.json({
    providers: getProviderSummary(),
    knownModels: KNOWN_MODELS,
  });
}

/**
 * POST /api/ai/models
 * { action: "complete", messages, provider?, model?, maxTokens?, temperature? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "complete") {
    const { messages, provider, model, maxTokens, temperature } = body as {
      messages?: Array<{ role: string; content: string }>;
      provider?: ProviderName;
      model?: string;
      maxTokens?: number;
      temperature?: number;
    };
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }
    const result = await multiComplete({
      messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      provider,
      model,
      maxTokens,
      temperature,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be complete" }, { status: 400 });
}
