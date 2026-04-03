"use client";

import { Shield, CheckCircle, AlertCircle, RefreshCw, Clock } from "lucide-react";
import type { FrameworkHealth } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HealthSummaryProps {
  health: FrameworkHealth;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function relativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const days = Math.floor(diffMs / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch {
    return dateStr;
  }
}

export function HealthSummary({ health, onRefresh, refreshing }: HealthSummaryProps) {
  const skillPct = health.skillsTotal > 0
    ? Math.round((health.skillsInstalled / health.skillsTotal) * 100)
    : 0;
  const mcpPct = health.mcpsTotal > 0
    ? Math.round((health.mcpsConfigured / health.mcpsTotal) * 100)
    : 0;

  return (
    <div className="bg-surface border border-border rounded-md p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-accent" />
        <span className="text-[13px] font-semibold text-text">
          AI Partner Framework
        </span>
        <span className="text-[10px] text-text-dim bg-surface-hover px-2 py-0.5 rounded-full">
          v{health.version}
        </span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-text-dim">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            Updated {relativeDate(health.lastCommitDate)}
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="text-text-dim hover:text-accent transition-colors disabled:opacity-50"
              title="Refresh framework data"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Skills Installed"
          count={health.skillsInstalled}
          total={health.skillsTotal}
          pct={skillPct}
        />
        <StatCard
          label="MCPs Configured"
          count={health.mcpsConfigured}
          total={health.mcpsTotal}
          pct={mcpPct}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  count,
  total,
  pct,
}: {
  label: string;
  count: number;
  total: number;
  pct: number;
}) {
  const full = pct === 100;
  const Icon = full ? CheckCircle : AlertCircle;

  return (
    <div className="flex items-center gap-3 bg-background rounded-md px-3 py-2.5 border border-border">
      <Icon
        size={16}
        className={cn(full ? "text-green-400" : "text-yellow-400")}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-text-muted">{label}</div>
        <div className="text-[14px] font-semibold text-text">
          {count}/{total}
          <span className="text-[11px] text-text-dim font-normal ml-1.5">
            ({pct}%)
          </span>
        </div>
      </div>
      <div className="w-16 h-1.5 bg-surface-hover rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            full ? "bg-green-400" : "bg-yellow-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
