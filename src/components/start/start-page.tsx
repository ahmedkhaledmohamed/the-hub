"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import type { StartCatalog, StartEntry } from "@/lib/start-catalog";

function Entry({ entry }: { entry: StartEntry }) {
  return (
    <article className={entry.previewHref ? "col-span-full grid gap-6 border-t border-border py-7 lg:grid-cols-[minmax(0,1fr)_300px]" : "min-w-0 border-t border-border py-6"}>
      <div>
        <h3 className="mb-2 text-lg font-medium text-text">{entry.name}</h3>
        {entry.description && <p className="mb-5 max-w-2xl text-sm leading-6 text-text-muted">{entry.description}</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {entry.links.map(link => (
            <a key={link.href} href={link.href} target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="inline-flex min-h-8 items-center gap-1.5 text-sm text-blue hover:underline">
              {link.label}{link.external && <ExternalLink size={12} aria-hidden="true" />}
            </a>
          ))}
        </div>
      </div>
      {entry.previewHref && (
        <a href={entry.links[0].href} className="block self-center rounded-md bg-surface p-3" aria-label={`Open ${entry.name}`}>
          <Image src={entry.previewHref} alt="" width={300} height={210} unoptimized className="h-auto w-full object-contain" />
        </a>
      )}
    </article>
  );
}

export function StartPage({ catalog }: { catalog: StartCatalog }) {
  const [query, setQuery] = useState("");
  const term = query.toLocaleLowerCase().trim();
  const sections = catalog.sections.map(section => ({ ...section,
    entries: section.entries.filter(entry => `${entry.name} ${entry.description || ""} ${section.title}`.toLocaleLowerCase().includes(term))
  })).filter(section => section.entries.length > 0);
  const total = catalog.sections.reduce((sum, section) => sum + section.entries.length, 0);
  const shown = sections.reduce((sum, section) => sum + section.entries.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-9 sm:py-10">
      <header className="mb-9">
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-text sm:text-4xl">Start</h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">{catalog.description}</p>
      </header>
      <nav aria-label="Start page sections" className="mb-7 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        {catalog.sections.map(section => <a key={section.id} href={`#${section.id}`} className="text-blue hover:underline">{section.title}</a>)}
      </nav>
      {catalog.warnings.length > 0 && <div role="status" className="mb-7 rounded-md border border-orange/40 bg-orange/5 p-4 text-sm text-orange">
        <p className="mb-2 font-medium">Some directory entries need attention</p>
        <ul className="list-inside list-disc space-y-1">{catalog.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </div>}
      <div className="mb-10 flex flex-wrap items-center gap-4">
        <label htmlFor="start-search" className="text-sm text-text-muted">Find an entry</label>
        <input id="start-search" type="search" placeholder="Project, tool, page, or visualization" value={query}
          onChange={event => setQuery(event.target.value)}
          className="min-h-11 w-full max-w-md rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-offset-4 placeholder:text-text-dim sm:text-sm" />
        <span className="text-xs text-text-muted" aria-live="polite">{shown} of {total} entries</span>
      </div>
      {sections.map(section => <section key={section.id} id={section.id} aria-labelledby={`section-${section.id}`} className="mb-10 scroll-mt-6">
        <h2 id={`section-${section.id}`} className="mb-4 text-xl font-medium text-text">{section.title}</h2>
        <div className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">{section.entries.map(entry => <Entry key={entry.id} entry={entry} />)}</div>
      </section>)}
      {!sections.length && <p className="py-9 text-sm text-text-muted">No matching entries. Try another name or clear the search.</p>}
      <footer className="mt-9 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-text-muted">
        {catalog.updated && <span>Directory updated {catalog.updated}</span>}
        {catalog.sources.map(source => <a key={source.href} href={source.href} className="text-text-muted hover:text-text">{source.label}</a>)}
      </footer>
    </div>
  );
}
