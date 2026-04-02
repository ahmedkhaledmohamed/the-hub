"use client";

import { useCallback } from "react";
import { usePersistedState } from "./use-persisted-state";

export function usePinnedArtifacts() {
  const [pinned, setPinned] = usePersistedState<string[]>("pinned-artifacts", []);

  const togglePin = useCallback(
    (path: string) => {
      setPinned((prev) =>
        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
      );
    },
    [setPinned],
  );

  const isPinned = useCallback((path: string) => pinned.includes(path), [pinned]);

  return { pinned, togglePin, isPinned };
}
