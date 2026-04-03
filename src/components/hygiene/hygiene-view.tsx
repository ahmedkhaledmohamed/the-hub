"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShieldCheck, RefreshCw, AlertTriangle, Copy, FileText,
  Trash2, Archive, Sparkles, ExternalLink, ChevronDown, ChevronRight,
  Filter,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import type { HygieneFinding, HygieneReport, HygieneFindingType } from "@/lib/types";

const TYPE_LABELS: Record<HygieneFindingType, string> = {
  "exact-duplicate": "Exact Duplicate",
  "near-duplicate": "Near Duplicate",
  "similar-title": "Similar Title",
  "same-filename": "Same Filename",
  "superseded": "Superseded",
  "stale-orphan": "Stale / Orphaned",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "#e74c3c",
  medium: "#e68a00",
  low: "#b3b300",
};

const TYPE_COLORS: Record<string, string> = {
  "exact-duplicate": "#e74c3c",
  "near-duplicate": "#ff6b9d",
  "similar-title": "#4a9eff",
  "same-filename": "#b388ff",
  "superseded": "#e68a00",
  "stale-orphan": "#666",
};

export function HygieneView() {
  const [report, setReport] = useState<HygieneReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const load = useCallback((refresh = false) => {
    setLoading(true);
    fetch(`/api/hygiene${refresh ? "?refresh=true" : ""}`)
      .then((r) => r.json())
      .then((d) => setReport(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!report) return [];
    return report.findings.filter((f) => {
      if (filterType !== "all" && f.type !== filterType) return false;
      if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
      return true;
    });
  }, [report, filterType, filterSeverity]);

  const typeOptions = useMemo(() => {
    if (!report) return [];
    const types = new Set(report.findings.map((f) => f.type));
    return Array.from(types);
  }, [report]);

  if (loading && !report) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck size={20} className="text-accent" />
          <h1 className="text-lg font-semibold text-text">Document Hygiene</h1>
        </div>
        <div className="text-[13px] text-text-dim animate-pulse">
          Analyzing {">"}1,800 artifacts for duplicates, overlaps, and stale content...
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text">Document Hygiene</h1>
        <span className="text-[11px] text-text-dim ml-auto">
          {report.stats.filesAnalyzed} files analyzed {relativeTime(report.stats.analyzedAt)}
        </span>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] text-text-dim hover:text-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Re-analyze
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Findings" value={report.stats.totalFindings} />
        <StatCard label="High Severity" value={report.stats.bySeverity.high || 0} color="#e74c3c" />
        <StatCard label="Medium" value={report.stats.bySeverity.medium || 0} color="#e68a00" />
        <StatCard label="Low" value={report.stats.bySeverity.low || 0} color="#b3b300" />
      </div>

      {/* Type breakdown */}
      {Object.keys(report.stats.byType).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(report.stats.byType).map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? "all" : type)}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-full border transition-colors",
                filterType === type
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-dim hover:border-text-dim",
              )}
            >
              {TYPE_LABELS[type as HygieneFindingType] || type} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={12} className="text-text-dim" />
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="bg-surface border border-border rounded px-2 py-1 text-[11px] text-text outline-none"
        >
          <option value="all">All severities</option>
          <option value="high">High only</option>
          <option value="medium">Medium only</option>
          <option value="low">Low only</option>
        </select>
        <span className="text-[11px] text-text-dim ml-auto">
          Showing {filtered.length} of {report.stats.totalFindings}
        </span>
      </div>

      {/* Findings */}
      <div className="space-y-2">
        {filtered.map((finding) => (
          <FindingCard key={finding.id} finding={finding} onAction={() => load(true)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-text-muted text-[13px]">
          {report.stats.totalFindings === 0
            ? "No hygiene issues found. Your workspace is clean."
            : "No findings match the current filters."}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface border border-border rounded-md px-4 py-3">
      <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color || "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function FindingCard({ finding, onAction }: { finding: HygieneFinding; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionDone, setActionDone] = useState<string | null>(null);

  const askAI = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/hygiene/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: finding.artifacts.map((a) => a.path),
          findingType: finding.type,
        }),
      });
      const data = await res.json();
      setAiReview(data.review);
      setExpanded(true);
    } finally {
      setAiLoading(false);
    }
  };

  const doAction = async (action: "archive" | "delete", path: string) => {
    const confirmed = action === "delete"
      ? confirm(`Delete "${path}"? This cannot be undone.`)
      : confirm(`Archive "${path}" to _archive/ folder?`);
    if (!confirmed) return;

    const res = await fetch("/api/hygiene/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, path }),
    });
    if (res.ok) {
      setActionDone(`${action === "delete" ? "Deleted" : "Archived"}: ${path}`);
      onAction();
    }
  };

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover transition-colors"
      >
        {expanded ? <ChevronDown size={12} className="text-text-dim shrink-0" /> : <ChevronRight size={12} className="text-text-dim shrink-0" />}

        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: SEVERITY_COLORS[finding.severity] }}
        />

        <span
          className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: TYPE_COLORS[finding.type] + "20", color: TYPE_COLORS[finding.type] }}
        >
          {TYPE_LABELS[finding.type]}
        </span>

        {finding.similarity != null && (
          <span className="text-[10px] text-text-dim tabular-nums shrink-0">
            {Math.round(finding.similarity * 100)}%
          </span>
        )}

        <span className="flex-1 text-[12px] text-text truncate">
          {finding.artifacts.map((a) => a.title).join(" ↔ ")}
        </span>

        <span className="text-[10px] text-text-dim shrink-0">
          {finding.artifacts.length} file{finding.artifacts.length > 1 ? "s" : ""}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <p className="text-[12px] text-text-muted mb-3">{finding.suggestion}</p>

          {/* Artifact list */}
          <div className="space-y-1.5 mb-3">
            {finding.artifacts.map((a) => (
              <div
                key={a.path}
                className="flex items-center gap-2 text-[11px] bg-surface-hover rounded px-3 py-2"
              >
                <FileText size={12} className="text-text-dim shrink-0" />
                <span className="flex-1 text-text-muted truncate font-mono">{a.path}</span>
                <span className="text-text-dim tabular-nums shrink-0">{a.staleDays}d old</span>
                <a
                  href={`cursor://file${resolveLocalPath(a.path)}`}
                  className="text-accent hover:underline shrink-0"
                  title="Open in Cursor"
                >
                  <ExternalLink size={10} />
                </a>
                <button
                  onClick={(e) => { e.stopPropagation(); doAction("archive", a.path); }}
                  className="text-text-dim hover:text-orange-400 transition-colors shrink-0"
                  title="Archive"
                >
                  <Archive size={10} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); doAction("delete", a.path); }}
                  className="text-text-dim hover:text-red-400 transition-colors shrink-0"
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>

          {actionDone && (
            <div className="text-[11px] text-accent mb-2">{actionDone}</div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {finding.artifacts.length >= 2 && (
              <button
                onClick={() => {
                  fetch("/api/hygiene/open", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paths: finding.artifacts.map((a) => a.path) }),
                  });
                }}
                className="flex items-center gap-1 text-[10px] text-text-dim hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-hover"
              >
                <ExternalLink size={10} /> Open all in Cursor
              </button>
            )}
            <button
              onClick={askAI}
              disabled={aiLoading}
              className="flex items-center gap-1 text-[10px] text-text-dim hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-hover disabled:opacity-50"
            >
              <Sparkles size={10} />
              {aiLoading ? "Analyzing..." : "Ask AI to review"}
            </button>
          </div>

          {/* AI Review */}
          {aiReview && (
            <div className="mt-3 p-3 bg-surface-hover rounded border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={11} className="text-accent" />
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">AI Review</span>
              </div>
              <div
                className="text-[12px] text-text-muted leading-relaxed prose-sm"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(aiReview) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function resolveLocalPath(artifactPath: string): string {
  // Paths are resolved dynamically via the /api/resolve endpoint at runtime.
  // This is a client-side fallback that assumes workspace dirs live under ~/Developer.
  const home = typeof window !== "undefined" ? "" : process.env.HOME || "";
  return `${home || "/tmp"}/Developer/${artifactPath}`;
}

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class='text-[11px] bg-surface px-1 rounded'>$1</code>")
    .replace(/\n/g, "<br />");
}
