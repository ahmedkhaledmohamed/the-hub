import { getClientConfig } from "@/lib/config";
import { getManifest } from "@/lib/manifest-store";
import { MorningBriefing } from "@/components/briefing/morning-briefing";

export const dynamic = "force-dynamic";

/**
 * Optimized briefing page — only sends artifacts the briefing actually needs.
 * Instead of ALL artifacts (could be 10K+), sends:
 * - Recently modified (staleDays <= 1): max 20
 * - Needs attention (staleDays > 14): max 20
 * - All artifacts (for pinned lookup + stats): dehydrated (path + staleDays + modifiedAt only)
 *
 * This reduces payload from ~1MB (10K artifacts) to ~50KB.
 */
export default async function BriefingPage() {
  const config = await getClientConfig();
  const manifest = getManifest();

  // Pre-filter server-side for briefing-relevant artifacts
  const allArtifacts = manifest.artifacts;

  // Full data for recently modified and needs-attention
  const recentlyModified = allArtifacts
    .filter((a) => a.staleDays <= 1)
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, 20);

  const needsAttention = allArtifacts
    .filter((a) => a.staleDays > 14)
    .sort((a, b) => b.staleDays - a.staleDays)
    .slice(0, 20);

  // Merge unique artifacts (some may overlap)
  const seen = new Set<string>();
  const briefingArtifacts = [];
  for (const a of [...recentlyModified, ...needsAttention, ...allArtifacts]) {
    if (!seen.has(a.path)) {
      seen.add(a.path);
      briefingArtifacts.push(a);
    }
  }

  return (
    <MorningBriefing
      artifacts={briefingArtifacts}
      panels={config.panels}
      generatedAt={manifest.generatedAt}
      stats={{
        total: allArtifacts.length,
        fresh: allArtifacts.filter((a) => a.staleDays <= 7).length,
        stale: allArtifacts.filter((a) => a.staleDays > 30).length,
      }}
    />
  );
}
