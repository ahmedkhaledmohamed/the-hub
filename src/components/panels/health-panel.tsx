"use client";

import { useState, useEffect, useMemo } from "react";
import { Activity } from "lucide-react";
import type { Artifact, ManifestGroup, HealthPanelConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HealthPanelProps {
  config: HealthPanelConfig;
}

interface HealthData {
  artifacts: Artifact[];
  groups: ManifestGroup[];
  generatedAt: string;
}

function BarSegment({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-16 text-text-dim text-right">{label}</div>
      <div className="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-12 text-text-dim tabular-nums">{count} ({pct}%)</div>
    </div>
  );
}

export function HealthPanel({ config }: HealthPanelProps) {
  const [data, setData] = useState<HealthData | null>(null);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => r.json())
      .then((m) => setData({ artifacts: m.artifacts, groups: m.groups, generatedAt: m.generatedAt }))
      .catch(() => {});
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const a = data.artifacts;
    const fresh = a.filter((x) => x.staleDays <= 7).length;
    const recent = a.filter((x) => x.staleDays > 7 && x.staleDays <= 30).length;
    const aging = a.filter((x) => x.staleDays > 30 && x.staleDays <= 90).length;
    const stale = a.filter((x) => x.staleDays > 90).length;

    const byGroup = data.groups
      .map((g) => ({
        label: g.label,
        count: g.count,
        avgStale: a.filter((x) => x.group === g.id).reduce((s, x) => s + x.staleDays, 0) / Math.max(g.count, 1),
      }))
      .sort((a, b) => b.avgStale - a.avgStale);

    return { total: a.length, fresh, recent, aging, stale, groups: data.groups.length, byGroup };
  }, [data]);

  if (!stats) {
    return (
      <div className="bg-surface border border-border rounded-md p-4">
        <div className="text-[13px] font-semibold text-text mb-2">{config.title}</div>
        <div className="text-[12px] text-text-dim">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Activity size={14} className="text-accent" />
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        <span className="ml-auto text-[11px] text-text-dim">
          {stats.total} artifacts &middot; {stats.groups} groups
        </span>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        <BarSegment label="Fresh" count={stats.fresh} total={stats.total} color="#1db954" />
        <BarSegment label="Recent" count={stats.recent} total={stats.total} color="#b3b300" />
        <BarSegment label="Aging" count={stats.aging} total={stats.total} color="#e68a00" />
        <BarSegment label="Stale" count={stats.stale} total={stats.total} color="#e74c3c" />
      </div>

      {stats.byGroup.length > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-2">Most neglected groups</div>
          <div className="space-y-1">
            {stats.byGroup.slice(0, 5).map((g) => (
              <div key={g.label} className="flex items-center text-[11px]">
                <span className="flex-1 text-text-muted truncate">{g.label}</span>
                <span className="text-text-dim tabular-nums">{Math.round(g.avgStale)}d avg</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
