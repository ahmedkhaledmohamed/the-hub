"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface CalendarEvent {
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  relatedArtifacts?: Array<{ path: string; title: string }>;
}

interface CalendarData {
  configured: boolean;
  events: CalendarEvent[];
  todayCount: number;
  message?: string;
}

// ── Component ─────────────────────────────────────────────────────

export function CalendarSection() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calendar");
      setData(await res.json());
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Don't render if calendar not configured or no events
  if (loading) return null;
  if (!data || !data.configured || data.events.length === 0) return null;

  return (
    <section className="mb-4 sm:mb-6">
      <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
        <Calendar size={14} className="text-blue-400" />
        <h2 className="text-[14px] font-semibold text-text-muted">Today&apos;s Meetings</h2>
        <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
          {data.events.length}
        </span>
      </div>

      <div className="space-y-2">
        {data.events.map((event, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-3 py-2 bg-surface border border-border rounded-md"
          >
            <div className="shrink-0 mt-0.5">
              <Clock size={14} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-text truncate">{event.title}</span>
                <span className="text-[10px] text-text-dim shrink-0">
                  {formatTime(event.startTime)}
                  {event.endTime && ` — ${formatTime(event.endTime)}`}
                </span>
              </div>
              {event.location && (
                <p className="text-[10px] text-text-muted mt-0.5">{event.location}</p>
              )}
              {event.relatedArtifacts && event.relatedArtifacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {event.relatedArtifacts.map((artifact, j) => (
                    <a
                      key={j}
                      href={`/api/file/${artifact.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 text-[10px] hover:bg-blue-900/30 transition-colors no-underline"
                    >
                      <FileText size={8} />
                      {artifact.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
}
