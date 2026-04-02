"use client";

import { useCallback } from "react";
import { usePersistedState } from "./use-persisted-state";

export interface RecentEntry {
  path: string;
  title: string;
  ts: number;
}

const MAX_RECENT = 20;

export function useRecentArtifacts() {
  const [recent, setRecent] = usePersistedState<RecentEntry[]>(
    "recent-artifacts",
    [],
  );

  const recordView = useCallback(
    (path: string, title: string) => {
      setRecent((prev) => {
        const filtered = prev.filter((r) => r.path !== path);
        return [{ path, title, ts: Date.now() }, ...filtered].slice(
          0,
          MAX_RECENT,
        );
      });
    },
    [setRecent],
  );

  return { recent, recordView };
}
