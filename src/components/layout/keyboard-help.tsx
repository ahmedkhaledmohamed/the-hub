"use client";

import { cn } from "@/lib/utils";
import type { TabConfig } from "@/lib/types";

interface KeyboardHelpProps {
  open: boolean;
  onClose: () => void;
  tabs: TabConfig[];
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] text-text-muted">{label}</span>
      <kbd className="text-[11px] text-text-dim bg-surface-hover px-2 py-0.5 rounded font-mono">
        {keys}
      </kbd>
    </div>
  );
}

export function KeyboardHelp({ open, onClose, tabs }: KeyboardHelpProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-[14px] font-semibold text-text">Keyboard Shortcuts</span>
          <kbd className="text-[10px] text-text-dim bg-surface-hover px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Navigation</div>
            <Shortcut keys="⌘ K" label="Search everything" />
            <Shortcut keys="⌘ ⇧ B" label="Go to Briefing" />
            <Shortcut keys="⌘ ⇧ R" label="Go to Repos" />
            {tabs.slice(0, 9).map((tab, i) => (
              <Shortcut key={tab.id} keys={`⌘ ${i + 1}`} label={`Go to ${tab.label}`} />
            ))}
          </div>

          <div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Actions</div>
            <Shortcut keys="⌘ J" label="Toggle Quick Notes" />
            <Shortcut keys="⌘ ⇧ E" label="Export current tab" />
            <Shortcut keys="⌘ B" label="Toggle sidebar" />
          </div>

          <div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">General</div>
            <Shortcut keys="?" label="Show this help" />
            <Shortcut keys="esc" label="Close overlay" />
          </div>
        </div>
      </div>
    </div>
  );
}
