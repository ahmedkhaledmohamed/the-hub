import { NextRequest, NextResponse } from "next/server";
import {
  createReviewRequest,
  updateReviewStatus,
  getReviewRequest,
  getReviewsForArtifact,
  getReviewsForReviewer,
  getPendingReviews,
  getReviewCounts,
} from "@/lib/reviews";
import type { ReviewStatus } from "@/lib/reviews";

export const dynamic = "force-dynamic";

/**
 * GET /api/reviews                    — pending reviews + counts
 * GET /api/reviews?path=<artifact>    — reviews for an artifact
 * GET /api/reviews?reviewer=<name>    — reviews for a person
 * GET /api/reviews?id=<id>            — specific review
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const reviewer = req.nextUrl.searchParams.get("reviewer");
  const id = req.nextUrl.searchParams.get("id");
  const status = req.nextUrl.searchParams.get("status") as ReviewStatus | null;

  if (id) {
    const review = getReviewRequest(parseInt(id, 10));
    if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(review);
  }

  if (path) return NextResponse.json({ path, reviews: getReviewsForArtifact(path) });
  if (reviewer) return NextResponse.json({ reviewer, reviews: getReviewsForReviewer(reviewer, status || undefined) });

  return NextResponse.json({ pending: getPendingReviews(), counts: getReviewCounts() });
}

/**
 * POST /api/reviews
 * { action: "create", artifactPath, requestedBy, reviewer, message? }
 * { action: "approve" | "request-changes" | "dismiss", id, responseMessage? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "create") {
    const { artifactPath, requestedBy, reviewer, message } = body as {
      artifactPath?: string; requestedBy?: string; reviewer?: string; message?: string;
    };
    if (!artifactPath || !requestedBy || !reviewer) {
      return NextResponse.json({ error: "artifactPath, requestedBy, reviewer required" }, { status: 400 });
    }
    const id = createReviewRequest({ artifactPath, requestedBy, reviewer, message });
    return NextResponse.json({ id, created: true });
  }

  if (action === "approve" || action === "request-changes" || action === "dismiss") {
    const { id, responseMessage } = body as { id?: number; responseMessage?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const statusMap: Record<string, ReviewStatus> = {
      approve: "approved", "request-changes": "changes-requested", dismiss: "dismissed",
    };
    const updated = updateReviewStatus(id, statusMap[action], responseMessage as string);
    return NextResponse.json({ id, updated, status: statusMap[action] });
  }

  return NextResponse.json({ error: "action must be create, approve, request-changes, or dismiss" }, { status: 400 });
}
