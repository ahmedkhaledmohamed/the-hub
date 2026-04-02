"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { RefreshCw, ArrowUpDown, Star, CheckSquare, X, Share2 } from "lucide-react";
import type { PanelConfig, ToolConfig, Artifact, ManifestGroup, FrameworkCatalog as FrameworkCatalogType } from "@/lib/types";
import { PanelRenderer } from "@/components/panels/panel-renderer";
import { ToolsPanel } from "@/components/panels/tools-panel";
import { FrameworkCatalog } from "@/components/framework/framework-catalog";
import { ArtifactGrid } from "@/components/artifacts/artifact-grid";
import { ArtifactPreview } from "@/components/artifacts/artifact-preview";
import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { ContextCompiler } from "@/components/context-compiler";
import { SearchBar } from "@/components/layout/search-bar";
import { relativeTime, cn } from "@/lib/utils";
import { useRecentArtifacts } from "@/hooks/use-recent-artifacts";
import { usePinnedArtifacts } from "@/hooks/use-pinned-artifacts";
import { usePersistedState } from "@/hooks/use-persisted-state";

type SortMode = "recent" | "stale" | "alpha";

interface TabContentProps {
  tabId: string;
  tabLabel: string;
  panels: PanelConfig[];
  tools: ToolConfig[];
  initialGroups: ManifestGroup[];
  initialArtifacts: Artifact[];
  generatedAt: string;
  frameworkCatalog?: FrameworkCatalogType | null;
}

export function TabContent({
  tabId,
  tabLabel,
  panels,
  tools,
  initialGroups,
  initialArtifacts,
  generatedAt,
  frameworkCatalog,
}: TabContentProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [scanTime, setScanTime] = useState(generatedAt);
  const [search, setSearch] = useState("");
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = usePersistedState<SortMode>("sort-mode", "recent");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const { recent, recordView } = useRecentArtifacts();
  const { pinned, togglePin, isPinned } = usePinnedArtifacts();

  useEffect(() => {
    try {
      localStorage.setItem("the-hub:last-tab", JSON.stringify(tabId));
    } catch { /* ignore */ }
  }, [tabId]);

  const regenerate = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/regenerate", { method: "POST" });
      const r = await fetch(`/api/manifest`);
      const manifest = await r.json();

      const tabGroups =
        tabId === "all"
          ? manifest.groups
          : manifest.groups.filter((g: ManifestGroup) => g.tab === tabId);
      const groupIds = new Set(tabGroups.map((g: ManifestGroup) => g.id));
      const tabArtifacts = manifest.artifacts.filter((a: Artifact) =>
        groupIds.has(a.group),
      );

      setGroups(tabGroups);
      setArtifacts(tabArtifacts);
      setScanTime(manifest.generatedAt);
    } finally {
      setRefreshing(false);
    }
  }, [tabId]);

  const sortedArtifacts = useMemo(() => {
    const sorted = [...artifacts];
    if (sortMode === "stale") sorted.sort((a, b) => b.staleDays - a.staleDays);
    else if (sortMode === "alpha") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else sorted.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    return sorted;
  }, [artifacts, sortMode]);

  const filteredArtifacts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sortedArtifacts;
    return sortedArtifacts.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.path.toLowerCase().includes(q) ||
        (a.snippet && a.snippet.toLowerCase().includes(q)),
    );
  }, [sortedArtifacts, search]);

  const pinnedArtifacts = useMemo(() => {
    const pinnedSet = new Set(pinned);
    return artifacts.filter((a) => pinnedSet.has(a.path));
  }, [artifacts, pinned]);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const recentArtifacts = useMemo(() => {
    const groupIds = new Set(groups.map((g) => g.id));
    const tabArtifactMap = new Map(
      artifacts.filter((a) => groupIds.has(a.group)).map((a) => [a.path, a]),
    );
    return recent
      .map((r) => tabArtifactMap.get(r.path))
      .filter((a): a is Artifact => !!a)
      .slice(0, 5);
  }, [recent, artifacts, groups]);

  const toggleSelect = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  const sortLabels: Record<SortMode, string> = { recent: "Recent", stale: "Most stale", alpha: "A-Z" };
  const nextSort: Record<SortMode, SortMode> = { recent: "stale", stale: "alpha", alpha: "recent" };

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-5">
        <h1 className="text-lg font-semibold">{tabLabel}</h1>
        <SearchBar value={search} onChange={setSearch} className="w-64" />
        <div className="flex items-center gap-3 ml-auto text-[12px] text-text-dim">
          <button
            onClick={() => setSortMode(nextSort[sortMode])}
            className="flex items-center gap-1 text-text-dim hover:text-accent transition-colors"
            title={`Sort: ${sortLabels[sortMode]}`}
          >
            <ArrowUpDown size={12} />
            <span>{sortLabels[sortMode]}</span>
          </button>
          <button
            onClick={() => {
              setSelectionMode((v) => !v);
              if (selectionMode) setSelectedPaths(new Set());
            }}
            className={cn(
              "flex items-center gap-1 transition-colors",
              selectionMode ? "text-accent" : "text-text-dim hover:text-accent",
            )}
            title={selectionMode ? "Exit selection" : "Select artifacts"}
          >
            {selectionMode ? <X size={12} /> : <CheckSquare size={12} />}
            <span>{selectionMode ? `${selectedPaths.size} selected` : "Select"}</span>
          </button>
          <span>
            <strong className="text-text-muted">{totalCount}</strong> artifacts
          </span>
          <span>
            <strong className="text-text-muted">{groups.length}</strong> groups
          </span>
          <span>Scanned {relativeTime(scanTime)}</span>
          <a
            href={`/api/export?tab=${tabId}`}
            download
            className="text-text-dim hover:text-accent transition-colors"
            title="Export tab as HTML"
          >
            <Share2 size={13} />
          </a>
          <button
            onClick={regenerate}
            disabled={refreshing}
            className="text-text-dim hover:text-accent transition-colors disabled:opacity-50"
            title="Rescan workspace"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      {selectionMode && selectedPaths.size > 0 && (
        <ContextCompiler
          selectedPaths={selectedPaths}
          artifacts={artifacts}
          onClear={() => { setSelectedPaths(new Set()); setSelectionMode(false); }}
        />
      )}

      {frameworkCatalog && (
        <FrameworkCatalog catalog={frameworkCatalog} />
      )}

      <PanelRenderer panels={panels} />

      {tools.length > 0 && (
        <div className="mb-6">
          <ToolsPanel
            config={{ type: "tools", title: "Tools & Dashboards", items: tools }}
          />
        </div>
      )}

      {pinnedArtifacts.length > 0 && !search && (
        <section className="mb-6">
          <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
            <Star size={14} className="text-yellow-400" fill="currentColor" />
            <h2 className="text-[14px] font-semibold text-text-muted">Pinned</h2>
            <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
              {pinnedArtifacts.length}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
            {pinnedArtifacts.map((a) => (
              <ArtifactCard
                key={a.path}
                artifact={a}
                onPreview={setPreviewArtifact}
                onView={recordView}
                pinned
                onTogglePin={togglePin}
                selected={selectedPaths.has(a.path)}
                onToggleSelect={toggleSelect}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        </section>
      )}

      {recentArtifacts.length > 0 && !search && (
        <section className="mb-6">
          <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-muted">Recently Viewed</h2>
            <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
              {recentArtifacts.length}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
            {recentArtifacts.map((a) => (
              <ArtifactCard
                key={a.path}
                artifact={a}
                onPreview={setPreviewArtifact}
                onView={recordView}
                pinned={isPinned(a.path)}
                onTogglePin={togglePin}
                selected={selectedPaths.has(a.path)}
                onToggleSelect={toggleSelect}
                selectionMode={selectionMode}
              />
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[13px]">
          No groups assigned to this tab. Add groups with{" "}
          <code>tab: &quot;{tabId}&quot;</code> in your config.
        </div>
      ) : (
        <>
          {groups.map((group) => {
            const groupArtifacts = filteredArtifacts.filter(
              (a) => a.group === group.id,
            );
            return (
              <ArtifactGrid
                key={group.id}
                group={group}
                artifacts={groupArtifacts}
                onPreview={setPreviewArtifact}
                onView={recordView}
                pinnedSet={pinnedSet}
                onTogglePin={togglePin}
                selectedSet={selectedPaths}
                onToggleSelect={toggleSelect}
                selectionMode={selectionMode}
              />
            );
          })}

          {search && filteredArtifacts.length === 0 && (
            <div className="text-center py-12 text-text-muted text-[13px]">
              No artifacts match &quot;{search}&quot;
            </div>
          )}
        </>
      )}

      <ArtifactPreview
        artifact={previewArtifact}
        onClose={() => setPreviewArtifact(null)}
      />
    </div>
  );
}
