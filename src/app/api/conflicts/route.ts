import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { scanForConflicts, conflictSummary } from "@/lib/conflict-detector";

export const dynamic = "force-dynamic";

/**
 * GET /api/conflicts — scan for document conflicts
 * GET /api/conflicts?ai=true — use AI for deeper analysis
 * GET /api/conflicts?group=<id> — scan specific group only
 */
export async function GET(req: NextRequest) {
  const useAI = req.nextUrl.searchParams.get("ai") === "true";
  const groupFilter = req.nextUrl.searchParams.get("group");

  const manifest = getManifest();
  let artifacts = manifest.artifacts;

  if (groupFilter) {
    artifacts = artifacts.filter((a) => a.group === groupFilter);
  }

  const conflicts = await scanForConflicts(artifacts, { useAI });

  return NextResponse.json({
    conflicts,
    summary: conflictSummary(conflicts),
    artifactsScanned: artifacts.length,
  });
}
