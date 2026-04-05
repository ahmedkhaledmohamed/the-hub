"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type ImpactLevel = "critical" | "high" | "medium" | "low" | "none";

export interface ImpactInfo {
  score: number;
  level: ImpactLevel;
}

const LEVEL_CONFIG: Record<ImpactLevel, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-900/40" },
  high: { label: "High", color: "text-orange-400", bg: "bg-orange-900/40" },
  medium: { label: "Med", color: "text-yellow-400", bg: "bg-yellow-900/40" },
  low: { label: "Low", color: "text-blue-400", bg: "bg-blue-900/40" },
  none: { label: "", color: "", bg: "" },
};

export function getLevelConfig(level: ImpactLevel) {
  return LEVEL_CONFIG[level];
}

/**
 * Hook to fetch impact scores for a set of artifact paths.
 * Batches requests and caches results for 5 minutes.
 */
const cache = new Map<string, { info: ImpactInfo; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function useImpactScores(paths: string[]): Map<string, ImpactInfo> {
  const [scores, setScores] = useState<Map<string, ImpactInfo>>(new Map());
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    if (paths.length === 0) return;

    // Check cache first
    const now = Date.now();
    const uncached: string[] = [];
    const result = new Map<string, ImpactInfo>();

    for (const path of paths) {
      const cached = cache.get(path);
      if (cached && now - cached.fetchedAt < CACHE_TTL) {
        result.set(path, cached.info);
      } else {
        uncached.push(path);
      }
    }

    // Fetch uncached in batch (limit to first 50)
    if (uncached.length > 0) {
      try {
        const res = await fetch("/api/impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "compute-batch", paths: uncached.slice(0, 50) }),
        });
        const data = await res.json();
        const fetchedScores = data.scores || [];
        for (const s of fetchedScores) {
          const info: ImpactInfo = { score: s.score, level: s.level };
          result.set(s.artifactPath, info);
          cache.set(s.artifactPath, { info, fetchedAt: now });
        }
      } catch { /* non-critical */ }
    }

    setScores(result);
  }, [paths]);

  useEffect(() => {
    if (!fetchedRef.current && paths.length > 0) {
      fetchedRef.current = true;
      load();
    }
  }, [load, paths]);

  return scores;
}

/**
 * Compute impact level from score (mirrors server-side logic).
 */
export function scoreToLevel(score: number): ImpactLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 10) return "low";
  return "none";
}
