"use client";

import { useEffect } from "react";
import type { TabConfig } from "@/lib/types";

interface ShortcutOptions {
  tabs: TabConfig[];
  onToggleNotes?: () => void;
  onToggleHelp?: () => void;
}

export function useKeyboardShortcuts({ onToggleNotes, onToggleHelp }: ShortcutOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // ? key — show help (only when not in an input)
      if (e.key === "?" && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onToggleHelp?.();
        return;
      }

      // Cmd+. — toggle Quick Notes (no browser/Cursor conflict)
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        onToggleNotes?.();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onToggleNotes, onToggleHelp]);
}
