import { readFileSync } from "node:fs";
import path from "node:path";
import { StartPage } from "../../src/components/start/start-page";
import type { StartCatalog } from "../../src/lib/start-catalog";

export default function Page() {
  const catalog: StartCatalog = JSON.parse(readFileSync(path.join(process.cwd(), "catalog.generated.json"), "utf8"));
  return <>
    <StartPage catalog={catalog} />
    <p className="mx-auto max-w-6xl px-5 pb-8 text-xs text-text-muted sm:px-9">Private workspace pages remain in the local Hub.</p>
  </>;
}
