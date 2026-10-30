import { redirect } from "next/navigation";
import { getDefaultTab, loadConfig } from "@/lib/config";
import { loadStartCatalog } from "@/lib/start-catalog";
import { StartPage } from "@/components/start/start-page";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = loadConfig();
  const catalog = loadStartCatalog(config);
  if (!catalog) redirect(`/${getDefaultTab(config)}`);
  return <StartPage catalog={catalog} />;
}
