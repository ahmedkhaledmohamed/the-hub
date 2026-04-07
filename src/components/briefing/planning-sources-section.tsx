"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, ExternalLink, AtSign, Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceStatus {
  id: string;
  label: string;
  type: string;
  itemCount: number;
  lastSynced: string | null;
}

interface MentionItem {
  sourceId: string;
  title: string;
  remoteUrl: string;
  mentions: string[];
}

interface SyncResult {
  sourceId: string;
  label: string;
  type: string;
  itemsSynced: number;
  mentionsFound: number;
  error?: string;
}

export function PlanningSourcesSection() {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [srcRes, mentRes] = await Promise.all([
        fetch("/api/planning-sources").then((r) => r.json()),
        fetch("/api/planning-sources?mentions=true").then((r) => r.json()),
      ]);
      setSources(srcRes.sources || []);
      setMentions(mentRes.mentions || []);
    } catch { /* non-critical */ }
    setLoaded(true);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSync = async () => {
    setSyncing(true);
    setLastSync(null);
    try {
      const res = await fetch("/api/planning-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-all" }),
      });
      const data = await res.json();
      setLastSync(data.results || []);
      await loadStatus();
    } catch { /* ignore */ }
    setSyncing(false);
  };

  if (!loaded) return null;
  if (sources.length === 0) return null;

  const hasAnyData = sources.some((s) => s.itemCount > 0);

  return (
    <section className="mb-4 sm:mb-6">
      <div className="flex items-center gap-3 mb-2.5 pb-1.5 border-b border-border">
        <AtSign size={14} className="text-purple-400" />
        <h2 className="text-[14px] font-semibold text-text-muted">Planning Sources</h2>
        <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
          {sources.length} source{sources.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-colors",
            syncing
              ? "bg-purple-900/30 text-purple-300 cursor-wait"
              : "bg-purple-900/20 text-purple-400 hover:bg-purple-900/40 border border-purple-800/30",
          )}
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>

      {/* Source status grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {sources.map((src) => (
          <div
            key={src.id}
            className="flex items-center gap-3 px-3 py-2 bg-surface border border-border rounded-md text-[12px]"
          >
            <span className={cn(
              "w-2 h-2 rounded-full shrink-0",
              src.lastSynced ? "bg-green-500" : "bg-zinc-600",
            )} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-text truncate">{src.label}</div>
              <div className="text-[10px] text-text-dim">
                {src.type} · {src.itemCount} item{src.itemCount !== 1 ? "s" : ""}
                {src.lastSynced && ` · synced ${formatTimestamp(src.lastSynced)}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sync results (shown after manual sync) */}
      {lastSync && (
        <div className="mb-3 px-3 py-2 bg-surface border border-border rounded-md">
          <div className="text-[11px] font-medium text-text-dim mb-1">Sync Results</div>
          {lastSync.map((r) => (
            <div key={r.sourceId} className="flex items-center gap-2 text-[11px] py-0.5">
              {r.error
                ? <AlertCircle size={11} className="text-red-400 shrink-0" />
                : <CheckCircle2 size={11} className="text-green-400 shrink-0" />}
              <span className="text-text-muted">{r.label}:</span>
              <span className="text-text">
                {r.error ? r.error : `${r.itemsSynced} items, ${r.mentionsFound} mentions`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mentions */}
      {mentions.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-purple-400 mb-1.5 flex items-center gap-1">
            <AtSign size={10} />
            {mentions.length} doc{mentions.length !== 1 ? "s" : ""} mention you or your team
          </div>
          <div className="space-y-1">
            {mentions.slice(0, 8).map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/10 border border-purple-800/20 rounded text-[11px]"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-text truncate block">{m.title}</span>
                  <span className="text-[10px] text-purple-300/70">
                    {m.mentions.join(", ")}
                  </span>
                </div>
                {m.remoteUrl && (
                  <a href={m.remoteUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 shrink-0">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
            {mentions.length > 8 && (
              <div className="text-[10px] text-text-dim px-3">
                + {mentions.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}

      {hasAnyData && mentions.length === 0 && !lastSync && (
        <div className="text-[11px] text-text-dim px-1">
          No mentions found. Click "Sync Now" to pull latest data.
        </div>
      )}

      {!hasAnyData && (
        <div className="text-[11px] text-text-dim px-1">
          No data yet. Click "Sync Now" to pull from configured sources.
        </div>
      )}
    </section>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
