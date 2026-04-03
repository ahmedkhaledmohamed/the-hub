"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search, FileText, Link2, Layout, Clock, GitFork,
  Zap, Sun, Download, StickyNote, Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHubConfig } from "@/components/providers/hub-provider";
import type { Artifact, LinkItem, RepoInfo } from "@/lib/types";
import { readPersistedValue } from "@/hooks/use-persisted-state";

type ResultType = "page" | "tab" | "link" | "artifact" | "recent" | "repo" | "action";

interface SearchResult {
  id: string;
  label: string;
  description?: string;
  type: ResultType;
  url?: string;
  artifact?: Artifact;
  action?: () => void;
}

interface ServerSearchResult {
  path: string;
  title: string;
  type: string;
  group: string;
  snippet: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [serverResults, setServerResults] = useState<ServerSearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = useHubConfig();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      fetch("/api/manifest")
        .then((r) => r.json())
        .then((m) => setArtifacts(m.artifacts || []))
        .catch(() => {});
      fetch("/api/repos")
        .then((r) => r.json())
        .then((d) => setRepos(d.repos || []))
        .catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Server-side full-text search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setServerResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchPending(true);

    searchTimerRef.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}&limit=15`)
        .then((r) => r.json())
        .then((d) => setServerResults(d.results || []))
        .catch(() => setServerResults([]))
        .finally(() => setSearchPending(false));
    }, 150);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  const allLinks = useMemo(() => {
    const links: { label: string; url: string; meta?: string }[] = [];
    for (const panels of Object.values(config.panels)) {
      for (const panel of panels) {
        if (panel.type === "links") {
          for (const item of (panel as { items: LinkItem[] }).items) {
            links.push({ label: item.label, url: item.url, meta: item.meta });
          }
        }
      }
    }
    for (const tool of config.tools) {
      links.push({ label: tool.label, url: tool.url, meta: tool.description });
    }
    return links;
  }, [config]);

  const pages: SearchResult[] = useMemo(() => [
    { id: "page:briefing", label: "Briefing", description: "Morning briefing view", type: "page", url: "/briefing" },
    { id: "page:repos", label: "Repos", description: "Connected repositories", type: "page", url: "/repos" },
  ], []);

  const actions: SearchResult[] = useMemo(() => [
    {
      id: "action:export",
      label: "Export current tab",
      description: "Download as standalone HTML",
      type: "action",
      action: () => {
        const tab = pathname.replace("/", "") || "all";
        window.open(`/api/export?tab=${tab}`, "_blank");
      },
    },
    {
      id: "action:baseline",
      label: "Set change feed baseline",
      description: "Mark current state for change tracking",
      type: "action",
      action: () => { fetch("/api/changes", { method: "POST" }); },
    },
    {
      id: "action:rescan",
      label: "Rescan workspace",
      description: "Regenerate manifest from disk",
      type: "action",
      action: () => { fetch("/api/regenerate", { method: "POST" }); },
    },
    {
      id: "action:new-doc",
      label: "New document",
      description: "Create a new doc from template",
      type: "action",
      action: () => {
        const opener = (window as unknown as Record<string, unknown>).__hubOpenNewDoc;
        if (typeof opener === "function") (opener as () => void)();
      },
    },
  ], [pathname]);

  const results = useMemo((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    const items: SearchResult[] = [];

    if (!q) {
      const recent = readPersistedValue<{ path: string; title: string; ts: number }[]>(
        "recent-artifacts",
        [],
      );
      for (const r of recent.slice(0, 5)) {
        items.push({
          id: `recent:${r.path}`,
          label: r.title,
          description: r.path,
          type: "recent",
          artifact: artifacts.find((a) => a.path === r.path),
        });
      }
      return items;
    }

    // Pages
    for (const p of pages) {
      if (p.label.toLowerCase().includes(q)) items.push(p);
    }

    // Tabs
    for (const tab of config.tabs) {
      if (tab.label.toLowerCase().includes(q) || tab.id.toLowerCase().includes(q)) {
        items.push({
          id: `tab:${tab.id}`,
          label: tab.label,
          description: "Tab",
          type: "tab",
          url: `/${tab.id}`,
        });
      }
    }

    // Actions
    for (const a of actions) {
      if (a.label.toLowerCase().includes(q) || (a.description && a.description.toLowerCase().includes(q))) {
        items.push(a);
      }
    }

    // Links
    for (const link of allLinks) {
      if (items.length >= 30) break;
      if (
        link.label.toLowerCase().includes(q) ||
        (link.meta && link.meta.toLowerCase().includes(q))
      ) {
        items.push({
          id: `link:${link.url}`,
          label: link.label,
          description: link.meta,
          type: "link",
          url: link.url,
        });
      }
    }

    // Repos
    let repoCount = 0;
    for (const r of repos) {
      if (repoCount >= 8) break;
      if (r.name.toLowerCase().includes(q) || r.remoteUrl.toLowerCase().includes(q)) {
        items.push({
          id: `repo:${r.path}`,
          label: r.name,
          description: `${r.workspace} · ${r.branch}`,
          type: "repo",
          url: r.browseUrl || undefined,
        });
        repoCount++;
      }
    }

    // Artifacts — prefer server-side FTS results, fall back to client-side substring
    const serverPaths = new Set(serverResults.map((r) => r.path));

    if (serverResults.length > 0) {
      for (const sr of serverResults) {
        if (items.length >= 30) break;
        const artifact = artifacts.find((a) => a.path === sr.path);
        items.push({
          id: `artifact:${sr.path}`,
          label: sr.title,
          description: sr.snippet || sr.path,
          type: "artifact",
          artifact,
        });
      }
    }

    // Client-side fallback for artifacts not found by server search
    let matchCount = 0;
    for (const a of artifacts) {
      if (matchCount >= 10) break;
      if (serverPaths.has(a.path)) continue; // already in server results
      if (
        a.title.toLowerCase().includes(q) ||
        a.path.toLowerCase().includes(q) ||
        (a.snippet && a.snippet.toLowerCase().includes(q))
      ) {
        items.push({
          id: `artifact:${a.path}`,
          label: a.title,
          description: a.path,
          type: "artifact",
          artifact: a,
        });
        matchCount++;
      }
    }

    return items;
  }, [query, config.tabs, allLinks, artifacts, repos, pages, actions, serverResults]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const execute = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      if (result.action) {
        result.action();
      } else if ((result.type === "tab" || result.type === "page") && result.url) {
        router.push(result.url);
      } else if ((result.type === "link" || result.type === "repo") && result.url) {
        window.open(result.url, "_blank");
      } else if ((result.type === "artifact" || result.type === "recent") && result.artifact) {
        window.open(`/api/file/${result.artifact.path}`, "_blank");
      }
    },
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        execute(results[activeIndex]);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [results, activeIndex, execute],
  );

  useEffect(() => {
    const active = listRef.current?.querySelector("[data-active=true]");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const typeIcon = (type: ResultType) => {
    switch (type) {
      case "page": return <Sun size={14} />;
      case "tab": return <Layout size={14} />;
      case "link": return <Link2 size={14} />;
      case "recent": return <Clock size={14} />;
      case "repo": return <GitFork size={14} />;
      case "action": return <Zap size={14} />;
      default: return <FileText size={14} />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-dim shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search everything..."
            className="flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-dim"
            autoComplete="off"
          />
          <kbd className="text-[10px] text-text-dim bg-surface-hover px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 && query && (
            <div className="px-4 py-8 text-center text-[13px] text-text-muted">
              No results for &quot;{query}&quot;
            </div>
          )}
          {results.length === 0 && !query && (
            <div className="px-4 py-8 text-center text-[13px] text-text-muted">
              Start typing to search everything...
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={result.id}
              data-active={i === activeIndex}
              onClick={() => execute(result)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                i === activeIndex
                  ? "bg-accent/15 text-text"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              <span className="text-text-dim shrink-0">
                {typeIcon(result.type)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate">
                  {result.label}
                </span>
                {result.description && (
                  <span className="block text-[11px] text-text-dim truncate">
                    {result.description}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-text-dim uppercase tracking-wider shrink-0">
                {result.type}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
