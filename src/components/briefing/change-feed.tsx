"use client";

import { useState, useEffect, useCallback } from "react";
import { FilePlus2, FileEdit, FileX2, RefreshCw, Save } from "lucide-react";
import type { ChangeFeedEntry } from "@/lib/types";
import { relativeTime, cn } from "@/lib/utils";

const typeIcons = {
  added: { Icon: FilePlus2, color: "text-[#3b82f6]" },
  modified: { Icon: FileEdit, color: "text-[#b3b300]" },
  deleted: { Icon: FileX2, color: "text-[#e74c3c]" },
} as const;

export function ChangeFeed() {
  const [changes, setChanges] = useState<ChangeFeedEntry[]>([]);
  const [previousScanAt, setPreviousScanAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changes");
      const data = await res.json();
      setChanges(data.changes);
      setPreviousScanAt(data.previousScanAt);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChanges(); }, [fetchChanges]);

  const markAsBaseline = async () => {
    await fetch("/api/changes", { method: "POST" });
    await fetchChanges();
  };

  const grouped = {
    added: changes.filter((c) => c.type === "added"),
    modified: changes.filter((c) => c.type === "modified"),
    deleted: changes.filter((c) => c.type === "deleted"),
  };

  return (
    <section className="mb-6">
      <div className="flex items-center gap-3 mb-3 pb-1.5 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text-muted">What Changed</h2>
        {previousScanAt && (
          <span className="text-[11px] text-text-dim">
            since {relativeTime(previousScanAt)}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={fetchChanges}
            disabled={loading}
            className="text-text-dim hover:text-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={markAsBaseline}
            className="flex items-center gap-1 text-[11px] text-text-dim hover:text-accent transition-colors"
            title="Mark current state as baseline"
          >
            <Save size={12} />
            <span>Set baseline</span>
          </button>
        </div>
      </div>

      {!previousScanAt ? (
        <div className="text-center py-8 text-text-dim text-[12px]">
          No baseline set yet. Click &quot;Set baseline&quot; to start tracking changes.
        </div>
      ) : changes.length === 0 ? (
        <div className="text-center py-8 text-text-dim text-[12px]">
          No changes detected since last baseline.
        </div>
      ) : (
        <div className="space-y-4">
          {(["added", "modified", "deleted"] as const).map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const { Icon, color } = typeIcons[type];
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon size={13} className={color} />
                  <span className={cn("text-[12px] font-semibold capitalize", color)}>
                    {type} ({items.length})
                  </span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1">
                  {items.map((c) => (
                    <div
                      key={c.path}
                      className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-transparent rounded text-[12px] hover:border-border transition-colors"
                    >
                      <span className="truncate flex-1 text-text-muted">{c.title}</span>
                      {c.modifiedAt && (
                        <span className="text-[10px] text-text-dim shrink-0">
                          {relativeTime(c.modifiedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
