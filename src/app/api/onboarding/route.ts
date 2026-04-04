import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { generateOnboardingPath } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding — generate an onboarding reading path
 * GET /api/onboarding?max=10 — limit items
 * GET /api/onboarding?minutes=60 — limit by reading time
 * GET /api/onboarding?group=planning — filter to specific group
 */
export async function GET(req: NextRequest) {
  const maxItems = parseInt(req.nextUrl.searchParams.get("max") || "15", 10);
  const maxMinutes = parseInt(req.nextUrl.searchParams.get("minutes") || "120", 10);
  const groupFilter = req.nextUrl.searchParams.get("group");

  const manifest = getManifest();
  let artifacts = manifest.artifacts;

  if (groupFilter) {
    artifacts = artifacts.filter((a) => a.group === groupFilter);
  }

  const path = generateOnboardingPath(artifacts, { maxItems, maxMinutes });

  return NextResponse.json(path);
}
