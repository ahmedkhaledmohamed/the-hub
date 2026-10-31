import { readFileSync } from "node:fs";
import path from "node:path";
import { StartPage } from "../../src/components/start/start-page";
import type { StartCatalog } from "../../src/lib/start-catalog";

export default function Page() {
  const catalog: StartCatalog = JSON.parse(readFileSync(path.join(process.cwd(), "catalog.generated.json"), "utf8"));
  return <>
    <nav className="hub-orientation" aria-label="Getting started"><a href="/start-here/">Start here</a><a href="/overview/">Personal overview</a><a href="/publishing/">What is published?</a></nav>
    <StartPage catalog={catalog} />
    <p className="mx-auto max-w-6xl px-5 pb-8 text-sm text-text-muted sm:px-9"><a className="text-blue hover:underline" href="/library/">Browse the Library</a> for Projects, Career, Learning, Goals, and Education.</p>
  </>;
}
