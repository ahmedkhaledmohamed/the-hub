import { NextRequest, NextResponse } from "next/server";
import {
  processArtifact,
  processBatch,
  startPipeline,
  isPipelineActive,
  getPipelineStats,
} from "@/lib/change-pipeline";

export const dynamic = "force-dynamic";

/**
 * GET /api/pipeline — pipeline status and stats
 */
export async function GET() {
  return NextResponse.json({
    active: isPipelineActive(),
    stats: getPipelineStats(),
  });
}

/**
 * POST /api/pipeline
 * { action: "start" }              — activate the pipeline
 * { action: "process", path }      — process a single artifact
 * { action: "process-batch", paths } — process multiple artifacts
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "start") {
    startPipeline();
    return NextResponse.json({ active: true, message: "Pipeline started" });
  }

  if (action === "process") {
    const path = body.path as string;
    if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
    const result = await processArtifact(path);
    return NextResponse.json(result);
  }

  if (action === "process-batch") {
    const paths = body.paths as string[];
    if (!paths || !Array.isArray(paths)) return NextResponse.json({ error: "paths array required" }, { status: 400 });
    const results = await processBatch(paths);
    return NextResponse.json({ results, count: results.length });
  }

  return NextResponse.json({ error: "action must be start, process, or process-batch" }, { status: 400 });
}
