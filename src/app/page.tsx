import { redirect } from "next/navigation";
import { loadConfig } from "@/lib/config";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = loadConfig();
  const manifest = getManifest();

  const hasWorkspaces = config.workspaces.length > 0;
  const hasArtifacts = manifest.artifacts.length > 0;

  if (!hasWorkspaces || !hasArtifacts) {
    redirect("/setup");
  }

  const defaultTab = config.tabs.find((t) => t.default)?.id || config.tabs[0]?.id || "briefing";
  redirect("/" + defaultTab);
}
