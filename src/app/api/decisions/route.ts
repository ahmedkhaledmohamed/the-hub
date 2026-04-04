import { NextRequest, NextResponse } from "next/server";
import {
  saveDecision,
  getDecision,
  getDecisionsForArtifact,
  getActiveDecisions,
  searchDecisions,
  supersedeDecision,
  revertDecision,
  getDecisionCounts,
  extractAndSaveDecisions,
  findContradictions,
} from "@/lib/decision-tracker";
import type { DecisionStatus } from "@/lib/decision-tracker";

export const dynamic = "force-dynamic";

/**
 * GET /api/decisions                         — active decisions + counts
 * GET /api/decisions?path=<artifact>         — decisions for an artifact
 * GET /api/decisions?id=<id>                 — specific decision
 * GET /api/decisions?search=<query>          — search decisions
 * GET /api/decisions?contradictions=true     — find contradictions
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const id = req.nextUrl.searchParams.get("id");
  const search = req.nextUrl.searchParams.get("search");
  const contradictions = req.nextUrl.searchParams.get("contradictions");

  if (id) {
    const decision = getDecision(parseInt(id, 10));
    if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(decision);
  }

  if (path) return NextResponse.json({ path, decisions: getDecisionsForArtifact(path) });
  if (search) return NextResponse.json({ query: search, decisions: searchDecisions(search) });
  if (contradictions === "true") return NextResponse.json({ contradictions: findContradictions() });

  return NextResponse.json({ decisions: getActiveDecisions(), counts: getDecisionCounts() });
}

/**
 * POST /api/decisions
 * { action: "create", artifactPath, summary, detail?, actor?, decidedAt? }
 * { action: "extract", artifactPath, useAI? }
 * { action: "supersede", id, supersededById }
 * { action: "revert", id }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "create") {
    const { artifactPath, summary, detail, actor, decidedAt } = body as {
      artifactPath?: string; summary?: string; detail?: string; actor?: string; decidedAt?: string;
    };
    if (!artifactPath || !summary) {
      return NextResponse.json({ error: "artifactPath and summary required" }, { status: 400 });
    }
    const id = saveDecision({ artifactPath, summary, detail, actor, decidedAt });
    return NextResponse.json({ id, created: true });
  }

  if (action === "extract") {
    const { artifactPath, useAI } = body as { artifactPath?: string; useAI?: boolean };
    if (!artifactPath) return NextResponse.json({ error: "artifactPath required" }, { status: 400 });
    const count = await extractAndSaveDecisions(artifactPath, { useAI });
    return NextResponse.json({ artifactPath, extracted: count });
  }

  if (action === "supersede") {
    const { id, supersededById } = body as { id?: number; supersededById?: number };
    if (!id || !supersededById) return NextResponse.json({ error: "id and supersededById required" }, { status: 400 });
    const updated = supersedeDecision(id, supersededById);
    return NextResponse.json({ id, updated, status: "superseded" });
  }

  if (action === "revert") {
    const { id } = body as { id?: number };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = revertDecision(id);
    return NextResponse.json({ id, updated, status: "reverted" });
  }

  return NextResponse.json({ error: "action must be create, extract, supersede, or revert" }, { status: 400 });
}
