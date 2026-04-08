"use client";

import { useState, useEffect, useCallback } from "react";
import type { HubPreferences } from "@/lib/config";

/**
 * Hook to read and mutate hub preferences.
 * Caches result for 60s. Optimistic local updates on mutate.
 */
let cachedPrefs: HubPreferences | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000;

// Subscriber pattern: notify all mounted hooks when cache updates
let listeners: Array<(p: HubPreferences) => void> = [];

export function usePreferences() {
  const [preferences, setPreferences] = useState<HubPreferences>(cachedPrefs || {});
  const [loading, setLoading] = useState(!cachedPrefs);

  useEffect(() => {
    // Subscribe to cache updates from other hook instances
    const listener = (p: HubPreferences) => setPreferences(p);
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }, []);

  const load = useCallback(async () => {
    if (cachedPrefs && Date.now() - cacheTime < CACHE_TTL) {
      setPreferences(cachedPrefs);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/preferences");
      const data: HubPreferences = await res.json();
      cachedPrefs = data;
      cacheTime = Date.now();
      setPreferences(data);
    } catch {
      // Keep current state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mutate = useCallback(async (partial: Partial<HubPreferences>) => {
    // Optimistic update
    const updated = { ...cachedPrefs, ...partial } as HubPreferences;
    cachedPrefs = updated;
    cacheTime = Date.now();
    setPreferences(updated);
    listeners.forEach((l) => l(updated));

    // Persist
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
    } catch {
      // Revert on failure
      await load();
    }
  }, [load]);

  return { preferences, loading, mutate };
}
