import { getClientConfig } from "@/lib/config-client";
import { getManifest } from "@/lib/manifest-store";
import { MorningBriefing } from "@/components/briefing/morning-briefing";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const config = await getClientConfig();
  const manifest = getManifest();

  return (
    <MorningBriefing
      artifacts={manifest.artifacts}
      panels={config.panels}
      generatedAt={manifest.generatedAt}
    />
  );
}
