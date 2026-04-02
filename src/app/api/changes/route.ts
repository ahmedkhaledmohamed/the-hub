import { NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { computeChangeFeed, loadPreviousSnapshot, saveSnapshot } from "@/lib/change-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = getManifest();
  const previous = loadPreviousSnapshot();
  const changes = computeChangeFeed(manifest, previous);

  return NextResponse.json({
    changes,
    previousScanAt: previous?.generatedAt || null,
    currentScanAt: manifest.generatedAt,
  });
}

export async function POST() {
  const manifest = getManifest();
  saveSnapshot(manifest);
  return NextResponse.json({ saved: true, generatedAt: manifest.generatedAt });
}
