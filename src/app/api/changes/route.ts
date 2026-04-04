import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { computeChangeFeed, loadPreviousSnapshot, saveSnapshot } from "@/lib/change-feed";
import { triageChangeFeed, triageSummary } from "@/lib/triage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const includeDiffs = req.nextUrl.searchParams.get("diffs") !== "false";
  const includeTriage = req.nextUrl.searchParams.get("triage") !== "false";
  const manifest = getManifest();
  const previous = loadPreviousSnapshot();
  let changes = computeChangeFeed(manifest, previous, { includeDiffs });

  // AI triage classification
  if (includeTriage && changes.length > 0) {
    changes = await triageChangeFeed(changes);
  }

  return NextResponse.json({
    changes,
    triage: triageSummary(changes),
    previousScanAt: previous?.generatedAt || null,
    currentScanAt: manifest.generatedAt,
  });
}

export async function POST() {
  const manifest = getManifest();
  saveSnapshot(manifest);
  return NextResponse.json({ saved: true, generatedAt: manifest.generatedAt });
}
