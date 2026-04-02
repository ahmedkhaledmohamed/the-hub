"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Link2, Layout, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHubConfig } from "@/components/providers/hub-provider";
import type { Artifact, LinkItem } from "@/lib/types";
import { readPersistedValue } from "@/hooks/use-persisted-state";

interface SearchResult {
  id: string;
  label: string;
  description?: string;
  type: "tab" | "link" | "artifact" | "recent";
  url?: string;
  artifact?: Artifact;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const config = useHubConfig();
  const router = useRouter();

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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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
    }

    for (const tab of config.tabs) {
      if (!q || tab.label.toLowerCase().includes(q) || tab.id.toLowerCase().includes(q)) {
        items.push({
          id: `tab:${tab.id}`,
          label: tab.label,
          description: "Tab",
          type: "tab",
          url: `/${tab.id}`,
        });
      }
    }

    if (q) {
      for (const link of allLinks) {
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

      let matchCount = 0;
      for (const a of artifacts) {
        if (matchCount >= 20) break;
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
    }

    return items;
  }, [query, config.tabs, allLinks, artifacts]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const execute = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      if (result.type === "tab" && result.url) {
        router.push(result.url);
      } else if (result.type === "link" && result.url) {
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

  const typeIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "tab":
        return <Layout size={14} />;
      case "link":
        return <Link2 size={14} />;
      case "recent":
        return <Clock size={14} />;
      default:
        return <FileText size={14} />;
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
            placeholder="Search tabs, links, artifacts..."
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
              Start typing to search...
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
