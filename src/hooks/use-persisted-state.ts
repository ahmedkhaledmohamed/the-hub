"use client";

import { useState, useEffect, useCallback } from "react";

const PREFIX = "the-hub:";

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = PREFIX + key;

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // quota exceeded or private browsing — ignore
    }
  }, [storageKey, state]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        return next;
      });
    },
    [],
  );

  return [state, setValue];
}

export function readPersistedValue<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = localStorage.getItem(PREFIX + key);
    return stored ? (JSON.parse(stored) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}
