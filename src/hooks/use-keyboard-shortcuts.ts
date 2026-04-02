"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { TabConfig } from "@/lib/types";

interface ShortcutOptions {
  tabs: TabConfig[];
  onToggleNotes?: () => void;
  onToggleHelp?: () => void;
}

export function useKeyboardShortcuts({ tabs, onToggleNotes, onToggleHelp }: ShortcutOptions) {
  const router = useRouter();
  const pathname = usePathname();

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

      // Cmd+Shift+B — Briefing
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        router.push("/briefing");
        return;
      }

      // Cmd+Shift+R — Repos
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        router.push("/repos");
        return;
      }

      // Cmd+J — toggle Quick Notes
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        onToggleNotes?.();
        return;
      }

      // Cmd+Shift+E — export current tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const tab = pathname.replace("/", "") || "all";
        window.open(`/api/export?tab=${tab}`, "_blank");
        return;
      }

      // Cmd+1 through Cmd+9 — jump to tab by position
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < tabs.length) {
          e.preventDefault();
          router.push(`/${tabs[idx].id}`);
        }
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router, pathname, tabs, onToggleNotes, onToggleHelp]);
}
