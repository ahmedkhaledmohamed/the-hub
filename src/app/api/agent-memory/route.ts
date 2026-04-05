import { NextRequest, NextResponse } from "next/server";
import {
  remember,
  recall,
  getObservation,
  getObservationCounts,
  getKnownAgents,
  forgetObservation,
  forgetSession,
  pruneMemory,
} from "@/lib/agent-memory";
import type { ObservationType } from "@/lib/agent-memory";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent-memory                          — all observations + counts
 * GET /api/agent-memory?search=<query>           — search memories
 * GET /api/agent-memory?type=<type>              — filter by type
 * GET /api/agent-memory?sessionId=<id>           — filter by session
 * GET /api/agent-memory?agentId=<id>             — filter by agent
 * GET /api/agent-memory?artifactPath=<path>      — filter by artifact
 * GET /api/agent-memory?agents=true              — list known agents
 */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") || undefined;
  const type = req.nextUrl.searchParams.get("type") as ObservationType | undefined;
  const sessionId = req.nextUrl.searchParams.get("sessionId") || undefined;
  const agentId = req.nextUrl.searchParams.get("agentId") || undefined;
  const artifactPath = req.nextUrl.searchParams.get("artifactPath") || undefined;
  const agents = req.nextUrl.searchParams.get("agents");

  if (agents === "true") {
    return NextResponse.json({ agents: getKnownAgents() });
  }

  const observations = recall({ search, type, sessionId, agentId, artifactPath });
  const counts = getObservationCounts();

  return NextResponse.json({ observations, counts });
}

/**
 * POST /api/agent-memory
 * { action: "remember", content, type?, agentId?, sessionId?, artifactPath?, confidence? }
 * { action: "forget", id }
 * { action: "forget-session", sessionId }
 * { action: "prune", olderThanDays? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "remember") {
    const content = body.content as string;
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
    const id = remember({
      content,
      type: body.type as ObservationType | undefined,
      agentId: body.agentId as string | undefined,
      sessionId: body.sessionId as string | undefined,
      artifactPath: body.artifactPath as string | undefined,
      confidence: body.confidence as number | undefined,
    });
    return NextResponse.json({ id, remembered: true });
  }

  if (action === "forget") {
    const id = body.id as number;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json({ forgotten: forgetObservation(id) });
  }

  if (action === "forget-session") {
    const sessionId = body.sessionId as string;
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    return NextResponse.json({ forgotten: forgetSession(sessionId) });
  }

  if (action === "prune") {
    const days = (body.olderThanDays as number) || 90;
    return NextResponse.json({ pruned: pruneMemory(days) });
  }

  return NextResponse.json({ error: "action must be remember, forget, forget-session, or prune" }, { status: 400 });
}
