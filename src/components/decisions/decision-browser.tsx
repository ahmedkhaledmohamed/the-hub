"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Search,
  AlertTriangle, ArrowRight, FileText, User, Clock,
  GitBranch, Filter, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

type DecisionStatus = "active" | "superseded" | "reverted";

interface Decision {
  id: number;
  artifactPath: string;
  summary: string;
  detail: string;
  actor: string | null;
  decidedAt: string | null;
  status: DecisionStatus;
  supersededBy: number | null;
  extractedAt: string;
  source: "heuristic" | "ai";
}

interface Contradiction {
  decisionA: Decision;
  decisionB: Decision;
  reason: string;
}

// ── Component ─────────────────────────────────────────────────────

export function DecisionBrowser() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [counts, setCounts] = useState<Record<DecisionStatus, number>>({ active: 0, superseded: 0, reverted: 0 });
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all">("all");
  const [showContradictions, setShowContradictions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/decisions");
      const data = await res.json();
      setDecisions(data.decisions || []);
      setCounts(data.counts || { active: 0, superseded: 0, reverted: 0 });
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  const loadContradictions = useCallback(async () => {
    try {
      const res = await fetch("/api/decisions?contradictions=true");
      const data = await res.json();
      setContradictions(data.contradictions || []);
    } catch { /* network error */ }
  }, []);

  const searchDecisions = useCallback(async (query: string) => {
    if (!query.trim()) { load(); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/decisions?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setDecisions(data.decisions || []);
    } catch { /* network error */ }
    setLoading(false);
  }, [load]);

  useEffect(() => { load(); loadContradictions(); }, [load, loadContradictions]);

  const handleSearch = () => searchDecisions(searchQuery);

  const updateStatus = async (id: number, action: "supersede" | "revert") => {
    const body = action === "revert"
      ? { action: "revert", id }
      : { action: "supersede", id, supersededById: 0 }; // supersede requires a replacement — simplified
    await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  };

  const filtered = statusFilter === "all"
    ? decisions
    : decisions.filter((d) => d.status === statusFilter);

  const total = counts.active + counts.superseded + counts.reverted;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="w-6 h-6 text-blue-400" /> Decisions
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {total} decision{total !== 1 ? "s" : ""} tracked across your workspace
            </p>
          </div>
          <button onClick={load} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Active" value={counts.active} color="text-green-400" onClick={() => setStatusFilter("active")} active={statusFilter === "active"} />
          <StatCard label="Superseded" value={counts.superseded} color="text-yellow-400" onClick={() => setStatusFilter("superseded")} active={statusFilter === "superseded"} />
          <StatCard label="Reverted" value={counts.reverted} color="text-red-400" onClick={() => setStatusFilter("reverted")} active={statusFilter === "reverted"} />
          <StatCard label="Contradictions" value={contradictions.length} color="text-orange-400" onClick={() => setShowContradictions(!showContradictions)} active={showContradictions} />
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search decisions..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <button onClick={handleSearch} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors">
            Search
          </button>
          {statusFilter !== "all" && (
            <button onClick={() => { setStatusFilter("all"); load(); }} className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 transition-colors flex items-center gap-1">
              <Filter className="w-3 h-3" /> Clear filter
            </button>
          )}
        </div>

        {/* Contradictions panel */}
        {showContradictions && contradictions.length > 0 && (
          <div className="mb-6 space-y-3">
            <h2 className="text-sm font-semibold text-orange-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Potential Contradictions
            </h2>
            {contradictions.map((c, i) => (
              <div key={i} className="bg-orange-900/10 border border-orange-800/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-200">{c.decisionA.summary}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{c.decisionA.artifactPath}</p>
                  </div>
                  <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-1" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-200">{c.decisionB.summary}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{c.decisionB.artifactPath}</p>
                  </div>
                </div>
                <p className="text-xs text-orange-300/60 mt-2">{c.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* Decision list */}
        {loading && decisions.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <GitBranch className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No decisions found.</p>
            <p className="text-xs mt-1">Decisions are extracted from your documents automatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} onRevert={() => updateStatus(decision.id, "revert")} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────

function StatCard({ label, value, color, onClick, active }: {
  label: string; value: number; color: string; onClick: () => void; active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3 rounded-lg text-center transition-colors border",
        active ? "bg-zinc-800 border-blue-600" : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700",
      )}
    >
      <p className={cn("text-xl font-bold", color)}>{value}</p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{label}</p>
    </button>
  );
}

const STATUS_COLORS: Record<DecisionStatus, string> = {
  active: "bg-green-900/40 text-green-400",
  superseded: "bg-yellow-900/40 text-yellow-400",
  reverted: "bg-red-900/40 text-red-400",
};

function DecisionCard({ decision, onRevert }: { decision: Decision; onRevert: () => void }) {
  return (
    <div className={cn(
      "bg-zinc-900/50 border rounded-lg p-4",
      decision.status === "active" ? "border-zinc-800" : "border-zinc-800/50",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[decision.status])}>
              {decision.status}
            </span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-mono",
              decision.source === "ai" ? "bg-purple-900/40 text-purple-400" : "bg-zinc-800 text-zinc-500",
            )}>
              {decision.source}
            </span>
          </div>
          <p className="text-sm font-medium text-zinc-200 leading-snug">{decision.summary}</p>
          {decision.detail && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{decision.detail}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-600">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {decision.artifactPath.split("/").pop()}
            </span>
            {decision.actor && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {decision.actor}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {decision.extractedAt ? new Date(decision.extractedAt).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>
        {decision.status === "active" && (
          <button
            onClick={onRevert}
            className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-400 transition-colors shrink-0"
            title="Mark as reverted"
          >
            Revert
          </button>
        )}
      </div>
    </div>
  );
}
