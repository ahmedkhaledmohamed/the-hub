"use client";

import { useState, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import type { PanelConfig, ToolConfig, Artifact } from "@/lib/types";
import { useManifest } from "@/hooks/use-manifest";
import { PanelRenderer } from "@/components/panels/panel-renderer";
import { ToolsPanel } from "@/components/panels/tools-panel";
import { ArtifactGrid } from "@/components/artifacts/artifact-grid";
import { ArtifactPreview } from "@/components/artifacts/artifact-preview";
import { SearchBar } from "@/components/layout/search-bar";
import { relativeTime } from "@/lib/utils";

interface TabContentProps {
  tabId: string;
  tabLabel: string;
  panels: PanelConfig[];
  tools: ToolConfig[];
}

export function TabContent({ tabId, tabLabel, panels, tools }: TabContentProps) {
  const { manifest, regenerate } = useManifest();
  const [search, setSearch] = useState("");
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);

  const tabGroups = useMemo(() => {
    if (!manifest) return [];
    if (tabId === "all") return manifest.groups;
    return manifest.groups.filter((g) => g.tab === tabId);
  }, [manifest, tabId]);

  const filteredArtifacts = useMemo(() => {
    if (!manifest) return [];
    const q = search.toLowerCase().trim();
    const groupIds = new Set(tabGroups.map((g) => g.id));

    return manifest.artifacts.filter((a) => {
      if (!groupIds.has(a.group)) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.path.toLowerCase().includes(q) ||
        (a.snippet && a.snippet.toLowerCase().includes(q))
      );
    });
  }, [manifest, tabGroups, search]);

  const totalCount = tabGroups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-5">
        <h1 className="text-lg font-semibold">{tabLabel}</h1>
        <SearchBar value={search} onChange={setSearch} className="w-64" />
        <div className="flex items-center gap-3 ml-auto text-[12px] text-text-dim">
          {manifest && (
            <>
              <span><strong className="text-text-muted">{totalCount}</strong> artifacts</span>
              <span><strong className="text-text-muted">{tabGroups.length}</strong> groups</span>
              <span>Scanned {relativeTime(manifest.generatedAt)}</span>
            </>
          )}
          <button
            onClick={regenerate}
            className="text-text-dim hover:text-accent transition-colors"
            title="Rescan workspace"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <PanelRenderer panels={panels} />

      {tools.length > 0 && (
        <div className="mb-6">
          <ToolsPanel config={{ type: "tools", title: "Tools & Dashboards", items: tools }} />
        </div>
      )}

      {!manifest ? (
        <div className="text-center py-16 text-text-muted text-[13px]">
          Loading artifacts...
        </div>
      ) : tabGroups.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[13px]">
          No groups assigned to this tab. Add groups with <code>tab: &quot;{tabId}&quot;</code> in your config.
        </div>
      ) : (
        <>
          {tabGroups.map((group) => {
            const groupArtifacts = filteredArtifacts.filter((a) => a.group === group.id);
            return (
              <ArtifactGrid
                key={group.id}
                group={group}
                artifacts={groupArtifacts}
                onPreview={setPreviewArtifact}
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
