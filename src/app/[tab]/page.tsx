import { getClientConfig } from "@/lib/config-client";
import { getManifest } from "@/lib/manifest-store";
import { notFound } from "next/navigation";
import { TabContent } from "./tab-content";

export const dynamic = "force-dynamic";

interface TabPageProps {
  params: Promise<{ tab: string }>;
}

export default async function TabPage({ params }: TabPageProps) {
  const { tab } = await params;
  const config = await getClientConfig();

  const tabConfig = config.tabs.find((t) => t.id === tab);
  if (!tabConfig) notFound();

  const panels = config.panels[tab] || [];
  const tools = tab === "deliverables" ? config.tools : [];

  const manifest = getManifest();

  const tabGroups =
    tab === "all"
      ? manifest.groups
      : manifest.groups.filter((g) => g.tab === tab);

  const groupIds = new Set(tabGroups.map((g) => g.id));
  const tabArtifacts = manifest.artifacts.filter((a) => groupIds.has(a.group));

  return (
    <TabContent
      tabId={tab}
      tabLabel={tabConfig.label}
      panels={panels}
      tools={tools}
      initialGroups={tabGroups}
      initialArtifacts={tabArtifacts}
      generatedAt={manifest.generatedAt}
    />
  );
}
