import { NextRequest, NextResponse } from "next/server";
import {
  computeImpactScore,
  computeBatchImpactScores,
  getHighImpactArtifacts,
  saveImpactScore,
  getLatestImpactScore,
  getImpactHistory,
  getImpactSummary,
} from "@/lib/impact-scoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/impact                        — high-impact artifacts + summary
 * GET /api/impact?path=<artifact>        — impact score for an artifact
 * GET /api/impact?path=<artifact>&history=true — score history
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const history = req.nextUrl.searchParams.get("history");

  if (path && history === "true") {
    return NextResponse.json({ path, history: getImpactHistory(path) });
  }

  if (path) {
    const saved = getLatestImpactScore(path);
    if (saved) return NextResponse.json(saved);
    const computed = computeImpactScore(path);
    return NextResponse.json(computed);
  }

  return NextResponse.json({
    highImpact: getHighImpactArtifacts(),
    summary: getImpactSummary(),
  });
}

/**
 * POST /api/impact
 * { action: "compute", path }            — compute and save score
 * { action: "compute-batch", paths }     — compute for multiple artifacts
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "compute") {
    const { path } = body as { path?: string };
    if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
    const score = computeImpactScore(path);
    saveImpactScore(score);
    return NextResponse.json(score);
  }

  if (action === "compute-batch") {
    const { paths } = body as { paths?: string[] };
    if (!paths || !Array.isArray(paths)) return NextResponse.json({ error: "paths array required" }, { status: 400 });
    const scores = computeBatchImpactScores(paths);
    for (const s of scores) saveImpactScore(s);
    return NextResponse.json({ scores, count: scores.length });
  }

  return NextResponse.json({ error: "action must be compute or compute-batch" }, { status: 400 });
}
