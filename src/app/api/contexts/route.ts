import { NextRequest, NextResponse } from "next/server";
import {
  getContextSummary,
  getActiveContextName,
  setActiveContext,
  resetContext,
  hasContexts,
} from "@/lib/context-manager";

export const dynamic = "force-dynamic";

/**
 * GET /api/contexts — list all contexts with active indicator
 */
export async function GET() {
  return NextResponse.json({
    contexts: getContextSummary(),
    activeContext: getActiveContextName(),
    hasContexts: hasContexts(),
  });
}

/**
 * POST /api/contexts — switch active context
 * Body: { name: "Work" } or { reset: true }
 */
export async function POST(req: NextRequest) {
  const { name, reset } = await req.json() as { name?: string; reset?: boolean };

  if (reset) {
    resetContext();
    return NextResponse.json({ activeContext: null, message: "Reset to default context" });
  }

  if (!name) {
    return NextResponse.json({ error: "name or reset required" }, { status: 400 });
  }

  setActiveContext(name);
  return NextResponse.json({ activeContext: name });
}
