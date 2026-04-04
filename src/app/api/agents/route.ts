import { NextRequest, NextResponse } from "next/server";
import {
  runAgent,
  runAllAgents,
  getAgentResults,
  getAgentStatus,
  getConfiguredAgents,
} from "@/lib/agent-scheduler";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents              — list configured agents with status
 * GET /api/agents?results=true — list recent agent results
 * GET /api/agents?id=<id>      — get status for a specific agent
 */
export async function GET(req: NextRequest) {
  const resultsOnly = req.nextUrl.searchParams.get("results") === "true";
  const agentId = req.nextUrl.searchParams.get("id");

  if (resultsOnly) {
    const results = getAgentResults(undefined, 20);
    return NextResponse.json({ results });
  }

  if (agentId) {
    const status = getAgentStatus(agentId);
    if (!status) {
      return NextResponse.json({ error: `Agent "${agentId}" not found` }, { status: 404 });
    }
    return NextResponse.json(status);
  }

  const agents = getConfiguredAgents();
  const statuses = agents.map((a) => {
    const status = getAgentStatus(a.id);
    return {
      id: a.id,
      type: a.type,
      enabled: a.enabled !== false,
      schedule: a.schedule,
      lastRun: status?.lastRun || null,
      runCount: status?.runCount || 0,
    };
  });

  return NextResponse.json({ agents: statuses });
}

/**
 * POST /api/agents — run agent(s)
 * Body: { id: "agent-id" } — run a specific agent
 * Body: { all: true } — run all enabled agents
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as { id?: string; all?: boolean };

  if (body.all) {
    const results = await runAllAgents();
    return NextResponse.json({ ran: results.length, results });
  }

  if (body.id) {
    try {
      const content = await runAgent(body.id);
      return NextResponse.json({ agentId: body.id, content });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : "Agent run failed",
      }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Provide { id } or { all: true }" }, { status: 400 });
}
