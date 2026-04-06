import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { analyzeHygiene, invalidateHygieneCache, getCachedHygieneSummary } from "@/lib/hygiene-analyzer";
import { readPreferences } from "@/lib/config";
import { enqueueJob, getJob, registerJobHandler } from "@/lib/job-queue";

export const dynamic = "force-dynamic";

// Register the async hygiene handler on module load
registerJobHandler("hygiene-analysis", async (payload) => {
  const manifest = getManifest();
  const exclude = (payload.hygieneExclude as string[]) || [];
  const artifacts = exclude.length > 0
    ? manifest.artifacts.filter((a) => !exclude.some((exc: string) => a.path.includes(exc)))
    : manifest.artifacts;

  invalidateHygieneCache();
  const report = analyzeHygiene(artifacts, manifest.generatedAt);
  return JSON.stringify({
    totalFindings: report.stats.totalFindings,
    filesAnalyzed: report.stats.filesAnalyzed,
  });
});

/**
 * GET /api/hygiene              — sync analysis (default)
 * GET /api/hygiene?refresh=true — force re-analysis
 * GET /api/hygiene?job=<id>     — check async job status
 */
export async function GET(req: NextRequest) {
  // Lightweight count endpoint for sidebar badge
  const countOnly = req.nextUrl.searchParams.get("count");
  if (countOnly === "true") {
    const summary = getCachedHygieneSummary();
    if (summary) return NextResponse.json(summary);
    // No cache — run quick analysis
    const manifest = getManifest();
    const report = analyzeHygiene(manifest.artifacts, manifest.generatedAt);
    return NextResponse.json({
      total: report.stats.totalFindings,
      high: report.stats.bySeverity.high || 0,
      medium: report.stats.bySeverity.medium || 0,
      low: report.stats.bySeverity.low || 0,
    });
  }

  // Check async job status
  const jobId = req.nextUrl.searchParams.get("job");
  if (jobId) {
    const job = getJob(parseInt(jobId, 10));
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      result: job.result ? JSON.parse(job.result) : null,
      error: job.error,
      createdAt: job.createdAt,
    });
  }

  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  if (refresh) invalidateHygieneCache();

  const manifest = getManifest();
  const prefs = readPreferences();
  const hygieneExclude = prefs.hygieneExclude || [];

  const artifacts = hygieneExclude.length > 0
    ? manifest.artifacts.filter((a) => !hygieneExclude.some((exc) => a.path.includes(exc)))
    : manifest.artifacts;

  const report = analyzeHygiene(artifacts, manifest.generatedAt);
  return NextResponse.json(report);
}

/**
 * POST /api/hygiene
 * { action: "analyze-async" } — enqueue background hygiene analysis
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action === "analyze-async") {
    const prefs = readPreferences();
    const jobId = enqueueJob("hygiene-analysis", {
      hygieneExclude: prefs.hygieneExclude || [],
    });
    return NextResponse.json({ jobId, status: "pending", message: "Hygiene analysis queued" });
  }

  return NextResponse.json({ error: "action must be analyze-async" }, { status: 400 });
}
