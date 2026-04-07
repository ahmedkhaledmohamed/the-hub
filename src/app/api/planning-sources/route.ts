import { NextRequest, NextResponse } from "next/server";
import {
  syncPlanningSource,
  syncAllPlanningSources,
  getPlanningSourceStatus,
  getItemsWithMentions,
} from "@/lib/planning-sources";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/planning-sources              — status of all sources
 * GET /api/planning-sources?mentions=true — items that mention user/team/org
 */
export async function GET(req: NextRequest) {
  const showMentions = req.nextUrl.searchParams.get("mentions") === "true";

  if (showMentions) {
    return NextResponse.json({ mentions: getItemsWithMentions() });
  }

  return NextResponse.json({ sources: getPlanningSourceStatus() });
}

/**
 * POST /api/planning-sources
 * { action: "sync", sourceId: "..." }  — sync one source
 * { action: "sync-all" }               — sync all enabled sources
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action === "sync" && typeof body.sourceId === "string") {
    const config = loadConfig();
    const source = (config.planningSources || []).find((s) => s.id === body.sourceId);
    if (!source) return NextResponse.json({ error: `Unknown source: ${body.sourceId}` }, { status: 404 });

    const result = await syncPlanningSource(source);
    return NextResponse.json(result);
  }

  if (body.action === "sync-all") {
    const results = await syncAllPlanningSources();
    return NextResponse.json({ results, total: results.length });
  }

  return NextResponse.json({ error: "action must be 'sync' or 'sync-all'" }, { status: 400 });
}
