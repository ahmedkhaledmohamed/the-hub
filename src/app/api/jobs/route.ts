import { NextRequest, NextResponse } from "next/server";
import {
  enqueueJob,
  getJob,
  getJobsByStatus,
  getJobCounts,
  getRegisteredHandlers,
} from "@/lib/job-queue";
import type { JobStatus } from "@/lib/job-queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/jobs              — job queue status and counts
 * GET /api/jobs?id=<id>      — get a specific job
 * GET /api/jobs?status=<s>   — list jobs by status
 */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("id");
  const status = req.nextUrl.searchParams.get("status") as JobStatus | null;

  if (jobId) {
    const job = getJob(parseInt(jobId, 10));
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    return NextResponse.json(job);
  }

  if (status) {
    const jobs = getJobsByStatus(status);
    return NextResponse.json({ jobs, count: jobs.length });
  }

  return NextResponse.json({
    counts: getJobCounts(),
    handlers: getRegisteredHandlers(),
  });
}

/**
 * POST /api/jobs — enqueue a new job
 * Body: { type, payload?, maxAttempts? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, payload, maxAttempts } = body as {
    type?: string;
    payload?: Record<string, unknown>;
    maxAttempts?: number;
  };

  if (!type || typeof type !== "string") {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const id = enqueueJob(type, payload || {}, maxAttempts || 3);
  return NextResponse.json({ id, type, status: "pending" });
}
