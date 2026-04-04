import { NextRequest, NextResponse } from "next/server";
import { getTrends, getPredictiveAlerts, recordSnapshot, getSnapshotCount } from "@/lib/trends";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/trends              — trend data (default 30 days)
 * GET /api/trends?days=90      — trend data for N days
 * GET /api/trends?alerts=true  — predictive alerts only
 * GET /api/trends?record=true  — record a snapshot now
 */
export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
  const alertsOnly = req.nextUrl.searchParams.get("alerts") === "true";
  const record = req.nextUrl.searchParams.get("record") === "true";

  if (record) {
    const manifest = getManifest();
    recordSnapshot(manifest);
    return NextResponse.json({ recorded: true, snapshotCount: getSnapshotCount() });
  }

  if (alertsOnly) {
    const manifest = getManifest();
    const alerts = getPredictiveAlerts(manifest);
    return NextResponse.json({ alerts });
  }

  const trends = getTrends(Math.min(days, 365));
  const manifest = getManifest();
  const alerts = getPredictiveAlerts(manifest);

  return NextResponse.json({
    trends,
    alerts,
    snapshotCount: getSnapshotCount(),
  });
}
