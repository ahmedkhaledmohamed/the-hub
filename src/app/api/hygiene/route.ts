import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { analyzeHygiene, invalidateHygieneCache } from "@/lib/hygiene-analyzer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  if (refresh) invalidateHygieneCache();

  const manifest = getManifest();
  const report = analyzeHygiene(manifest.artifacts);
  return NextResponse.json(report);
}
