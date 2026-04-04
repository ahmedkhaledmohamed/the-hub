import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { analyzeHygiene, invalidateHygieneCache } from "@/lib/hygiene-analyzer";
import { readPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  if (refresh) invalidateHygieneCache();

  const manifest = getManifest();
  const prefs = readPreferences();
  const hygieneExclude = prefs.hygieneExclude || [];

  // Filter out excluded directories from hygiene analysis
  const artifacts = hygieneExclude.length > 0
    ? manifest.artifacts.filter((a) => !hygieneExclude.some((exc) => a.path.includes(exc)))
    : manifest.artifacts;

  const report = analyzeHygiene(artifacts, manifest.generatedAt);
  return NextResponse.json(report);
}
