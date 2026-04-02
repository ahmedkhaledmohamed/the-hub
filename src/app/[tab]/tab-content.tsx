"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import type { PanelConfig, ToolConfig, Artifact, ManifestGroup } from "@/lib/types";
import { PanelRenderer } from "@/components/panels/panel-renderer";
import { ToolsPanel } from "@/components/panels/tools-panel";
import { ArtifactGrid } from "@/components/artifacts/artifact-grid";
import { ArtifactPreview } from "@/components/artifacts/artifact-preview";
import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { SearchBar } from "@/components/layout/search-bar";
import { relativeTime } from "@/lib/utils";
import { useRecentArtifacts } from "@/hooks/use-recent-artifacts";

interface TabContentProps {
  tabId: string;
  tabLabel: string;
  panels: PanelConfig[];
  tools: ToolConfig[];
  initialGroups: ManifestGroup[];
  initialArtifacts: Artifact[];
  generatedAt: string;
}

export function TabContent({
  tabId,
  tabLabel,
  panels,
  tools,
  initialGroups,
  initialArtifacts,
  generatedAt,
}: TabContentProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [scanTime, setScanTime] = useState(generatedAt);
  const [search, setSearch] = useState("");
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { recent, recordView } = useRecentArtifacts();

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

  const filteredArtifacts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return artifacts;
    return artifacts.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.path.toLowerCase().includes(q) ||
        (a.snippet && a.snippet.toLowerCase().includes(q)),
    );
  }, [artifacts, search]);

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

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-5">
        <h1 className="text-lg font-semibold">{tabLabel}</h1>
        <SearchBar value={search} onChange={setSearch} className="w-64" />
        <div className="flex items-center gap-3 ml-auto text-[12px] text-text-dim">
          <span>
            <strong className="text-text-muted">{totalCount}</strong> artifacts
          </span>
          <span>
            <strong className="text-text-muted">{groups.length}</strong> groups
          </span>
          <span>Scanned {relativeTime(scanTime)}</span>
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

      <PanelRenderer panels={panels} />

      {tools.length > 0 && (
        <div className="mb-6">
          <ToolsPanel
            config={{ type: "tools", title: "Tools & Dashboards", items: tools }}
          />
        </div>
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
