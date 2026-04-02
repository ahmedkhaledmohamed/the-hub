import { getClientConfig } from "@/lib/config-client";
import { notFound } from "next/navigation";
import { TabContent } from "./tab-content";

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

  return (
    <TabContent
      tabId={tab}
      tabLabel={tabConfig.label}
      panels={panels}
      tools={tools}
    />
  );
}

export async function generateStaticParams() {
  const config = await getClientConfig();
  return config.tabs.map((t) => ({ tab: t.id }));
}
