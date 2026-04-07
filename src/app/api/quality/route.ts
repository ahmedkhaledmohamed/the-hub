import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { computeWorkspaceHealth, computeArtifactQuality } from "@/lib/quality-score";

export const dynamic = "force-dynamic";

/**
 * GET /api/quality                    — workspace health metric
 * GET /api/quality?path=<artifact>    — single artifact quality score
 */
export async function GET(req: NextRequest) {
  const manifest = getManifest();
  const artifactPath = req.nextUrl.searchParams.get("path");

  // Build hygiene flags set
  const hygieneFlags = new Set<string>();
  try {
    const { getCachedHygieneSummary } = await import("@/lib/hygiene-analyzer");
    const cached = getCachedHygieneSummary();
    if (cached) {
      // Re-run to get finding paths
      const { analyzeHygiene } = await import("@/lib/hygiene-analyzer");
      const report = analyzeHygiene(manifest.artifacts, manifest.generatedAt);
      for (const f of report.findings) {
        for (const a of f.artifacts) hygieneFlags.add(a.path);
      }
    }
  } catch { /* non-critical */ }

  if (artifactPath) {
    const artifact = manifest.artifacts.find((a) => a.path === artifactPath);
    if (!artifact) {
      return NextResponse.json({ error: `Artifact not found: ${artifactPath}` }, { status: 404 });
    }
    return NextResponse.json(computeArtifactQuality(artifact, hygieneFlags));
  }

  return NextResponse.json(computeWorkspaceHealth(manifest.artifacts, hygieneFlags));
}
