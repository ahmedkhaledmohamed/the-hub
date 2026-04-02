import { redirect } from "next/navigation";
import { getClientConfig } from "@/lib/config-client";

export default async function Home() {
  const config = await getClientConfig();
  redirect(`/${config.defaultTab}`);
}
