"use client";

import { useMemo } from "react";
import { Sun, AlertTriangle, Clock, Star, TrendingDown } from "lucide-react";
import type { Artifact, PanelConfig, TimelinePanelConfig } from "@/lib/types";
import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { stalenessInfo, relativeTime, cn } from "@/lib/utils";
import { usePinnedArtifacts } from "@/hooks/use-pinned-artifacts";
import { useRecentArtifacts } from "@/hooks/use-recent-artifacts";
import { ChangeFeed } from "./change-feed";
import { PredictiveInsights } from "./predictive-insights";
import { IntelligenceSummary } from "./intelligence-summary";

interface MorningBriefingProps {
  artifacts: Artifact[];
  panels: Record<string, PanelConfig[]>;
  generatedAt: string;
  stats?: { total: number; fresh: number; stale: number };
}

export function MorningBriefing({ artifacts, panels, generatedAt, stats: precomputedStats }: MorningBriefingProps) {
  const { pinned, togglePin, isPinned } = usePinnedArtifacts();
  const { recordView } = useRecentArtifacts();

  const recentlyModified = useMemo(
    () =>
      artifacts
        .filter((a) => a.staleDays <= 1)
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .slice(0, 10),
    [artifacts],
  );

  const needsAttention = useMemo(
    () =>
      artifacts
        .filter((a) => a.staleDays > 14)
        .sort((a, b) => b.staleDays - a.staleDays)
        .slice(0, 10),
    [artifacts],
  );

  const pinnedArtifacts = useMemo(() => {
    const pinnedSet = new Set(pinned);
    return artifacts.filter((a) => pinnedSet.has(a.path));
  }, [artifacts, pinned]);

  const activeTimeline = useMemo(() => {
    const items: { panelTitle: string; text: string; date: string }[] = [];
    for (const tabPanels of Object.values(panels)) {
      for (const panel of tabPanels) {
        if (panel.type === "timeline") {
          const tp = panel as TimelinePanelConfig;
          for (const item of tp.items) {
            if (item.status === "active") {
              items.push({ panelTitle: tp.title, text: item.text, date: item.date });
            }
          }
        }
      }
    }
    return items;
  }, [panels]);

  const stats = useMemo(() => {
    if (precomputedStats) return precomputedStats;
    const fresh = artifacts.filter((a) => a.staleDays <= 7).length;
    const stale = artifacts.filter((a) => a.staleDays > 30).length;
    return { total: artifacts.length, fresh, stale };
  }, [artifacts, precomputedStats]);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <Sun size={20} className="text-yellow-400 shrink-0" />
        <h1 className="text-base sm:text-lg font-semibold">Morning Briefing</h1>
        <span className="text-[10px] sm:text-[11px] text-text-dim ml-auto whitespace-nowrap">
          {relativeTime(generatedAt)}
        </span>
      </div>

      {/* Intelligence summary — pending reviews, active decisions, errors */}
      <IntelligenceSummary />

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="bg-surface border border-border rounded-md px-3 py-2 sm:px-4 sm:py-3">
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1">Total artifacts</div>
          <div className="text-2xl font-bold text-text">{stats.total}</div>
        </div>
        <div className="bg-surface border border-border rounded-md px-3 py-2 sm:px-4 sm:py-3">
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1 flex items-center gap-1">
            <Clock size={10} /> Fresh (7d)
          </div>
          <div className="text-2xl font-bold text-[#3b82f6]">{stats.fresh}</div>
        </div>
        <div className="bg-surface border border-border rounded-md px-3 py-2 sm:px-4 sm:py-3">
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1 flex items-center gap-1">
            <TrendingDown size={10} /> Stale (30d+)
          </div>
          <div className="text-2xl font-bold text-[#e68a00]">{stats.stale}</div>
        </div>
      </div>

      {/* Predictive insights */}
      <PredictiveInsights />

      {/* Active milestones */}
      {activeTimeline.length > 0 && (
        <section className="mb-4 sm:mb-6">
          <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
            <h2 className="text-[14px] font-semibold text-accent">Active Milestones</h2>
          </div>
          <div className="space-y-1.5">
            {activeTimeline.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 bg-surface border border-border rounded-md text-[12px]"
              >
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                <span className="text-text-dim font-semibold w-12 shrink-0">{item.date}</span>
                <span
                  className="flex-1 text-text-muted [&>strong]:text-text [&>strong]:font-medium"
                  dangerouslySetInnerHTML={{ __html: item.text }}
                />
                <span className="text-[10px] text-text-dim">{item.panelTitle}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pinned artifacts */}
      {pinnedArtifacts.length > 0 && (
        <section className="mb-4 sm:mb-6">
          <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
            <Star size={14} className="text-yellow-400" fill="currentColor" />
            <h2 className="text-[14px] font-semibold text-text-muted">Pinned</h2>
            <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
              {pinnedArtifacts.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
            {pinnedArtifacts.map((a) => (
              <ArtifactCard
                key={a.path}
                artifact={a}
                onView={recordView}
                pinned
                onTogglePin={togglePin}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently modified */}
      {recentlyModified.length > 0 && (
        <section className="mb-4 sm:mb-6">
          <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-muted">Modified Today / Yesterday</h2>
            <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
              {recentlyModified.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
            {recentlyModified.map((a) => (
              <ArtifactCard
                key={a.path}
                artifact={a}
                onView={recordView}
                pinned={isPinned(a.path)}
                onTogglePin={togglePin}
              />
            ))}
          </div>
        </section>
      )}

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <section className="mb-4 sm:mb-6">
          <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
            <AlertTriangle size={14} className="text-[#e68a00]" />
            <h2 className="text-[14px] font-semibold text-text-muted">Needs Attention</h2>
            <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
              {needsAttention.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
            {needsAttention.map((a) => (
              <ArtifactCard
                key={a.path}
                artifact={a}
                onView={recordView}
                pinned={isPinned(a.path)}
                onTogglePin={togglePin}
              />
            ))}
          </div>
        </section>
      )}

      <ChangeFeed />

      {recentlyModified.length === 0 && needsAttention.length === 0 && pinnedArtifacts.length === 0 && (
        <div className="text-center py-16 text-text-muted text-[13px]">
          Nothing to show yet. Pin artifacts or modify files to populate the briefing.
        </div>
      )}
    </div>
  );
}
