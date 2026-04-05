"use client";

import { useState, useEffect, useCallback } from "react";

export interface FeatureInfo {
  name: string;
  available: boolean;
  reason: string;
}

export interface FeatureStatus {
  aiConfigured: boolean;
  aiProvider: string | null;
  features: FeatureInfo[];
  loading: boolean;
}

/**
 * Hook to check feature availability from the setup API.
 * Caches the result for 60 seconds to avoid repeated calls.
 */
let cachedStatus: FeatureStatus | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

export function useFeatureStatus(): FeatureStatus {
  const [status, setStatus] = useState<FeatureStatus>(
    cachedStatus || { aiConfigured: false, aiProvider: null, features: [], loading: true },
  );

  const load = useCallback(async () => {
    // Return cache if fresh
    if (cachedStatus && Date.now() - cacheTime < CACHE_TTL) {
      setStatus(cachedStatus);
      return;
    }

    try {
      const res = await fetch("/api/setup");
      const data = await res.json();
      const result: FeatureStatus = {
        aiConfigured: data.ai?.configured || false,
        aiProvider: data.ai?.provider || null,
        features: data.features || [],
        loading: false,
      };
      cachedStatus = result;
      cacheTime = Date.now();
      setStatus(result);
    } catch {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return status;
}

/**
 * Check if a specific feature is available.
 */
export function isFeatureAvailable(features: FeatureInfo[], name: string): boolean {
  const feature = features.find((f) => f.name === name);
  return feature?.available ?? false;
}

/**
 * Get the reason a feature is unavailable.
 */
export function getFeatureReason(features: FeatureInfo[], name: string): string {
  const feature = features.find((f) => f.name === name);
  return feature?.reason || "Not configured";
}
