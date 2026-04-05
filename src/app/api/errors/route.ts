import { NextRequest, NextResponse } from "next/server";
import {
  getActiveErrors,
  getErrorCounts,
  getErrorSummary,
  resolveError,
  resolveErrorsByCategory,
  pruneErrors,
} from "@/lib/error-reporter";
import type { ErrorCategory, ErrorSeverity } from "@/lib/error-reporter";

export const dynamic = "force-dynamic";

/**
 * GET /api/errors                     — active errors
 * GET /api/errors?category=ai         — filter by category
 * GET /api/errors?summary=true        — counts by severity
 * GET /api/errors?counts=true         — counts by category
 */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") as ErrorCategory | null;
  const severity = req.nextUrl.searchParams.get("severity") as ErrorSeverity | null;
  const summary = req.nextUrl.searchParams.get("summary");
  const counts = req.nextUrl.searchParams.get("counts");

  if (summary === "true") return NextResponse.json(getErrorSummary());
  if (counts === "true") return NextResponse.json(getErrorCounts());

  const errors = getActiveErrors({
    category: category || undefined,
    severity: severity || undefined,
  });
  return NextResponse.json({ errors, count: errors.length });
}

/**
 * POST /api/errors
 * { action: "resolve", id }
 * { action: "resolve-category", category }
 * { action: "prune", olderThanDays? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "resolve") {
    const id = body.id as number;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json({ resolved: resolveError(id) });
  }

  if (action === "resolve-category") {
    const category = body.category as ErrorCategory;
    if (!category) return NextResponse.json({ error: "category required" }, { status: 400 });
    return NextResponse.json({ resolved: resolveErrorsByCategory(category) });
  }

  if (action === "prune") {
    const days = (body.olderThanDays as number) || 30;
    return NextResponse.json({ removed: pruneErrors(days) });
  }

  return NextResponse.json({ error: "action must be resolve, resolve-category, or prune" }, { status: 400 });
}
