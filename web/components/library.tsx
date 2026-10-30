"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { documentHref, type LibraryDocument, type LibraryEntry, type LibraryIndex } from "../library-types";

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const libraryHref = (folder: string) => `/library/${folder ? `?folder=${encodeURIComponent(folder)}` : ""}`;
const folderName = (folder: string) => folder.split("/").at(-1)!.replace(/[-_]/g, " ");

function useLibrary() {
  const [index, setIndex] = useState<LibraryIndex | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/library/index.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Library index unavailable");
      return response.json();
    }).then(setIndex).catch(error => { if (error.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, []);
  return { index, error };
}

function Loading({ error }: { error: boolean }) {
  return <p className="library-status" role="status">{error ? <>The Library could not load. <button onClick={() => window.location.reload()}>Retry</button></> : "Loading the Library…"}</p>;
}

function Breadcrumbs({ folder }: { folder: string }) {
  const parts = folder.split("/").filter(Boolean);
  return <nav aria-label="Library breadcrumb" className="library-breadcrumb">
    <a href="/library/">Library</a>{parts.map((part, index) => <span key={index}> / <a href={libraryHref(parts.slice(0, index + 1).join("/"))}>{part.replace(/[-_]/g, " ")}</a></span>)}
  </nav>;
}

export function LibraryBrowser() {
  const { index, error } = useLibrary();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [format, setFormat] = useState("all");
  const [limit, setLimit] = useState(50);
  const deferredQuery = useDeferredValue(query);
  const searchable = useMemo(() => index?.entries.map(entry => ({ entry,
    search: normalize(`${entry.title} ${entry.path} ${entry.text}`) })) || [], [index]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); setFolder(params.get("folder") || ""); setQuery(params.get("q") || ""); }, []);
  if (!index) return <div className="library-page"><h1>Library</h1><Loading error={error} /></div>;
  const terms = normalize(deferredQuery).trim().split(/\s+/).filter(Boolean);
  const selectedCategory = index.categories.find(category => folder === category.path || folder.startsWith(category.path + "/"));
  const inFolder = index.entries.filter(entry => !folder || entry.path.startsWith(folder + "/"));
  const entries = searchable.filter(({ entry, search }) => (!folder || entry.path.startsWith(folder + "/"))
    && (format === "all" || entry.kind === format) && terms.every(term => search.includes(term))).map(({ entry }) => entry)
    .sort((a, b) => {
      const titleMatch = (entry: LibraryEntry) => terms.filter(term => normalize(entry.title).includes(term)).length;
      if (terms.length && titleMatch(a) !== titleMatch(b)) return titleMatch(b) - titleMatch(a);
      const indexPage = (entry: LibraryEntry) => /\/(README|00-INDEX)\.md$/.test(entry.path) && entry.folder === folder;
      return Number(indexPage(b)) - Number(indexPage(a)) || a.path.localeCompare(b.path);
    });
  const children = [...new Set(inFolder.map(entry => entry.folder).filter(value => value !== folder)
    .map(value => folder ? folder + "/" + value.slice(folder.length + 1).split("/")[0] : value.split("/")[0]))].sort();
  const chooseFolder = (value: string) => {
    setFolder(value); setLimit(50);
    const params = new URLSearchParams(); if (value) params.set("folder", value); if (query) params.set("q", query);
    window.history.replaceState(null, "", `/library/${params.size ? "?" + params : ""}`);
  };
  return <div className="library-page">
    <header className="library-heading"><h1>Library</h1><p>Documents and supporting files from your Personal repo.</p></header>
    <div className="library-layout">
      <aside className="library-sidebar" aria-label="Library categories">
        <button aria-pressed={!folder} onClick={() => chooseFolder("")}>All categories <span>{index.entries.length}</span></button>
        {index.categories.map(category => <button key={category.id} aria-pressed={selectedCategory?.id === category.id} onClick={() => chooseFolder(category.path)}>{category.title}<span>{category.count}</span></button>)}
        <a href="https://prep-hub-lake.vercel.app" target="_blank" rel="noopener noreferrer" className="library-prep-link">Open Prep Hub</a>
      </aside>
      <div className="library-results">
        <div className="library-search">
          <label htmlFor="library-search">Search titles and contents</label>
          <input id="library-search" type="search" value={query} placeholder="Topic, document, company, or phrase" onChange={event => {
            setQuery(event.target.value); setLimit(50);
            const params = new URLSearchParams(); if (folder) params.set("folder", folder); if (event.target.value) params.set("q", event.target.value);
            window.history.replaceState(null, "", `/library/${params.size ? "?" + params : ""}`);
          }} />
          <label htmlFor="library-format" className="sr-only">File type</label>
          <select id="library-format" value={format} onChange={event => { setFormat(event.target.value); setLimit(50); }}>
            <option value="all">All file types</option><option value="markdown">Documents</option><option value="pdf">PDFs</option><option value="image">Images</option><option value="file">Downloads</option>
          </select>
        </div>
        {folder && <Breadcrumbs folder={folder} />}
        {!query && children.length > 0 && <nav className="library-folders" aria-label="Folders">{children.map(child => <button key={child} onClick={() => chooseFolder(child)}>{folderName(child)}<span>{inFolder.filter(entry => entry.path.startsWith(child + "/")).length}</span></button>)}</nav>}
        <p className="library-count" aria-live="polite">{entries.length} {entries.length === 1 ? "result" : "results"}{folder ? ` in ${folder}` : " across all categories"}</p>
        <div className="library-document-list">{entries.slice(0, limit).map(entry => <a className="library-result" href={documentHref(entry.path)} key={entry.id}>
          <div><h2>{entry.title}</h2><p className="library-path">{entry.path}</p>{entry.text && <p className="library-excerpt">{excerpt(entry.text, query)}</p>}</div><span className="library-format">{entry.format}</span>
        </a>)}</div>
        {entries.length === 0 && <p className="library-status">No matching documents. Try fewer words, another file type, or All categories.</p>}
        {entries.length > limit && <button className="library-button" onClick={() => setLimit(limit + 50)}>Show more results ({entries.length - limit} remaining)</button>}
      </div>
    </div>
  </div>;
}

function excerpt(text: string, query: string) {
  const term = query.trim().split(/\s+/)[0];
  const position = term ? normalize(text).indexOf(normalize(term)) : 0;
  const start = Math.max(0, position - 70);
  return `${start ? "…" : ""}${text.slice(start, start + 210)}${text.length > start + 210 ? "…" : ""}`;
}

export function LibraryReader() {
  const { index, error } = useLibrary();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [document, setDocument] = useState<LibraryDocument | null>(null);
  const [documentError, setDocumentError] = useState(false);
  const [missingSection, setMissingSection] = useState(false);
  useEffect(() => { setSourcePath(new URLSearchParams(window.location.search).get("path") || ""); }, []);
  const entry = index?.entries.find(entry => entry.path === sourcePath);
  useEffect(() => {
    if (!entry || (entry.kind !== "markdown" && entry.format !== "SVG")) return;
    const controller = new AbortController(); setDocument(null); setDocumentError(false); setMissingSection(false);
    fetch(`/library/documents/${entry.id}.json`, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Document unavailable"); return response.json();
    }).then(value => {
      setDocument(value);
      if (window.location.hash) requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          const section = window.document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
          if (section) section.scrollIntoView(); else setMissingSection(true);
        } catch { setMissingSection(true); }
      }));
    }).catch(error => { if (error.name !== "AbortError") setDocumentError(true); });
    return () => controller.abort();
  }, [entry?.id, entry?.kind, entry?.format]);
  useEffect(() => { if (entry) window.document.title = `${entry.title} | Personal Hub`; }, [entry?.title]);
  if (!index || sourcePath === null) return <div className="library-page"><Loading error={error} /></div>;
  if (!entry) return <div className="library-page"><h1>Document not found</h1><p>This file is not part of the published Library.</p><a href="/library/">Browse the Library</a></div>;
  const sourceUrl = `https://github.com/ahmedkhaledmohamed/Personal/blob/main/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
  const fileHref = entry.fileHref || document?.imageData;
  const headings = document?.headings?.filter(heading => heading.level > 1 && heading.level < 4) || [];
  return <div className="library-page library-reader">
    <Breadcrumbs folder={entry.folder} />
    <header className="library-heading"><h1>{entry.title}</h1><p className="library-path">{entry.path}</p>
      <div className="library-actions"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>{fileHref && entry.kind !== "file" && <a href={fileHref} download={entry.path.split("/").at(-1)}>Download {entry.format}</a>}</div>
    </header>
    <div className="library-reading-layout">
      <div className="library-reading-main">
        {missingSection && <p className="library-status" role="status">The linked section was not found. Use On this page to choose another section.</p>}
        {entry.kind === "pdf" && entry.textSearch === false && <p className="library-status">This PDF has no extractable text. Search finds its title; the full file is available below.</p>}
        {entry.kind === "markdown" && (!document ? <Loading error={documentError} /> : <article className="library-article" dangerouslySetInnerHTML={{ __html: document.html || "" }} />)}
        {entry.kind === "pdf" && <><iframe className="library-pdf" src={entry.fileHref} title={entry.title} /><p className="library-status">If the preview is unavailable, use Download PDF.</p></>}
        {entry.kind === "image" && (fileHref ? <img className="library-image" src={fileHref} alt={entry.title} /> : <Loading error={documentError} />)}
        {entry.kind === "file" && <div className="library-download"><p>{entry.format} file. {(entry.bytes / 1024).toFixed(0)} KB.</p><a className="library-button" href={entry.fileHref} download={entry.path.split("/").at(-1)}>Download {entry.format}</a></div>}
      </div>
      {headings.length > 0 && <nav className="library-toc" aria-label="On this page"><h2>On this page</h2>{headings.map(heading => <a key={heading.id} className={heading.level === 3 ? "nested" : ""} href={`#${heading.id}`}>{heading.text}</a>)}</nav>}
    </div>
  </div>;
}
