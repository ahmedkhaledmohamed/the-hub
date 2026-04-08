"use client";

import { useState, useEffect, useCallback } from "react";
import type { HubPreferences } from "@/lib/config";

let cachedPrefs: HubPreferences | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000;

let listeners: Array<(p: HubPreferences) => void> = [];

export function usePreferences() {
  const [preferences, setPreferences] = useState<HubPreferences>(cachedPrefs || {});
  const [loading, setLoading] = useState(!cachedPrefs);

  useEffect(() => {
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
    } catch { /* keep current */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mutate = useCallback(async (partial: Partial<HubPreferences>) => {
    const updated = { ...cachedPrefs, ...partial } as HubPreferences;
    cachedPrefs = updated;
    cacheTime = Date.now();
    setPreferences(updated);
    listeners.forEach((l) => l(updated));

    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
    } catch { await load(); }
  }, [load]);

  return { preferences, loading, mutate };
}
