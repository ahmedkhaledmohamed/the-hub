"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, MessageSquare, GitBranch, TrendingUp,
  Shield, Zap, Loader2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface IntelligenceData {
  reviews: { pending: number; total: number };
  decisions: { active: number; total: number };
  errors: { total: number; critical: number };
  hygiene: { findings: number };
  impact: { high: number };
}

// ── Component ─────────────────────────────────────────────────────

export function IntelligenceSummary() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all intelligence signals in parallel
      const [reviewsRes, decisionsRes, errorsRes] = await Promise.allSettled([
        fetch("/api/reviews").then((r) => r.json()),
        fetch("/api/decisions").then((r) => r.json()),
        fetch("/api/errors?summary=true").then((r) => r.json()),
      ]);

      const reviews = reviewsRes.status === "fulfilled" ? reviewsRes.value : null;
      const decisions = decisionsRes.status === "fulfilled" ? decisionsRes.value : null;
      const errors = errorsRes.status === "fulfilled" ? errorsRes.value : null;

      setData({
        reviews: {
          pending: reviews?.pending?.length || reviews?.counts?.pending || 0,
          total: Object.values(reviews?.counts || {}).reduce((s: number, n) => s + (n as number), 0) as number || 0,
        },
        decisions: {
          active: decisions?.counts?.active || 0,
          total: Object.values(decisions?.counts || {}).reduce((s: number, n) => s + (n as number), 0) as number || 0,
        },
        errors: {
          total: errors?.total || 0,
          critical: errors?.critical || 0,
        },
        hygiene: { findings: 0 },
        impact: { high: 0 },
      });
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
      </div>
    );
  }

  if (!data) return null;

  // Only show cards that have non-zero values
  const cards: Array<{
    label: string;
    value: number;
    sub: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    href: string;
    show: boolean;
  }> = [
    {
      label: "Pending Reviews",
      value: data.reviews.pending,
      sub: `of ${data.reviews.total} total`,
      icon: <MessageSquare className="w-4 h-4" />,
      color: "text-yellow-400",
      bg: "bg-yellow-900/20 border-yellow-800/30",
      href: "/api/reviews",
      show: data.reviews.pending > 0,
    },
    {
      label: "Active Decisions",
      value: data.decisions.active,
      sub: `of ${data.decisions.total} tracked`,
      icon: <GitBranch className="w-4 h-4" />,
      color: "text-blue-400",
      bg: "bg-blue-900/20 border-blue-800/30",
      href: "/decisions",
      show: data.decisions.active > 0,
    },
    {
      label: "System Errors",
      value: data.errors.total,
      sub: data.errors.critical > 0 ? `${data.errors.critical} critical` : "warnings",
      icon: <AlertTriangle className="w-4 h-4" />,
      color: data.errors.critical > 0 ? "text-red-400" : "text-orange-400",
      bg: data.errors.critical > 0 ? "bg-red-900/20 border-red-800/30" : "bg-orange-900/20 border-orange-800/30",
      href: "/status",
      show: data.errors.total > 0,
    },
  ];

  const visibleCards = cards.filter((c) => c.show);
  if (visibleCards.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {visibleCards.map((card) => (
        <a
          key={card.label}
          href={card.href}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors no-underline hover:opacity-90",
            card.bg,
          )}
        >
          <span className={card.color}>{card.icon}</span>
          <div>
            <div className={cn("text-lg font-bold", card.color)}>{card.value}</div>
            <div className="text-[10px] text-text-dim">{card.label}</div>
            <div className="text-[9px] text-text-muted">{card.sub}</div>
          </div>
        </a>
      ))}
    </div>
  );
}
