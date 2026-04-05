"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap, AlertTriangle, Calendar, TrendingDown,
  ChevronDown, ChevronUp, Loader2, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

type BriefingPriority = "urgent" | "important" | "informational";

interface BriefingItem {
  artifactPath: string;
  title: string;
  priority: BriefingPriority;
  reason: string;
  relatedEvent: string | null;
}

interface MeetingBriefingItem {
  eventTitle: string;
  eventTime: string;
  relatedDocs: Array<{ path: string; title: string; relevance: string }>;
}

interface DecayAlertItem {
  artifactPath: string;
  title: string;
  lastAccessed: string;
  accessCount: number;
  reason: string;
}

interface PredictiveBriefing {
  items: BriefingItem[];
  meetingContext: MeetingBriefingItem[];
  decayAlerts: DecayAlertItem[];
  stats: {
    totalItems: number;
    urgent: number;
    important: number;
    informational: number;
    meetingCount: number;
    decayAlerts: number;
  };
  score: number;
}

const PRIORITY_CONFIG: Record<BriefingPriority, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  urgent: { icon: <AlertTriangle className="w-3 h-3" />, color: "text-red-400", bg: "bg-red-900/30", label: "Urgent" },
  important: { icon: <Zap className="w-3 h-3" />, color: "text-yellow-400", bg: "bg-yellow-900/30", label: "Important" },
  informational: { icon: <FileText className="w-3 h-3" />, color: "text-blue-400", bg: "bg-blue-900/30", label: "Info" },
};

// ── Component ─────────────────────────────────────────────────────

export function PredictiveInsights() {
  const [data, setData] = useState<PredictiveBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/briefing");
      const json = await res.json();
      setData(json);
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Don't render if no insights
  if (!loading && (!data || (data.items.length === 0 && data.meetingContext.length === 0 && data.decayAlerts.length === 0))) {
    return null;
  }

  const urgentItems = data?.items.filter((i) => i.priority === "urgent") || [];
  const importantItems = data?.items.filter((i) => i.priority === "important") || [];

  return (
    <section className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 mb-2.5 pb-1.5 border-b border-border"
      >
        <Zap size={14} className="text-purple-400" />
        <h2 className="text-[14px] font-semibold text-text-muted">Predictive Insights</h2>
        {data && data.items.length > 0 && (
          <span className="flex items-center gap-1.5">
            {data.stats.urgent > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 font-medium">
                {data.stats.urgent} urgent
              </span>
            )}
            {data.stats.important > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 font-medium">
                {data.stats.important} important
              </span>
            )}
          </span>
        )}
        <span className="ml-auto text-text-dim">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
            </div>
          ) : (
            <>
              {/* Urgent + Important items */}
              {(urgentItems.length > 0 || importantItems.length > 0) && (
                <div className="space-y-1.5">
                  {[...urgentItems, ...importantItems].map((item, i) => {
                    const config = PRIORITY_CONFIG[item.priority];
                    return (
                      <div
                        key={`${item.artifactPath}-${i}`}
                        className={cn("flex items-start gap-2.5 px-3 py-2 rounded-md border", config.bg, "border-transparent")}
                      >
                        <span className={cn("mt-0.5 shrink-0", config.color)}>{config.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-text truncate">{item.title}</span>
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0", config.color, config.bg)}>
                              {config.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-dim mt-0.5 line-clamp-1">{item.reason}</p>
                          {item.relatedEvent && (
                            <span className="flex items-center gap-1 text-[10px] text-purple-400 mt-0.5">
                              <Calendar className="w-2.5 h-2.5" /> {item.relatedEvent}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Meeting context */}
              {data && data.meetingContext.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-text-dim font-semibold uppercase tracking-wider">
                    <Calendar size={10} /> Meetings with related docs
                  </div>
                  {data.meetingContext.map((meeting, i) => (
                    <div key={i} className="bg-surface border border-border rounded-md px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium text-text">{meeting.eventTitle}</span>
                        <span className="text-[10px] text-text-dim">{meeting.eventTime}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {meeting.relatedDocs.map((doc, j) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-surface-hover text-text-dim">
                            {doc.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Decay alerts */}
              {data && data.decayAlerts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-text-dim font-semibold uppercase tracking-wider">
                    <TrendingDown size={10} /> Knowledge decay
                  </div>
                  {data.decayAlerts.slice(0, 5).map((alert, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <TrendingDown className="w-3 h-3 text-orange-400 shrink-0" />
                      <span className="text-text-dim truncate flex-1">{alert.title}</span>
                      <span className="text-text-muted text-[10px] shrink-0">{alert.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
