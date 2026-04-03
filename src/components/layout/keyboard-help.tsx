"use client";

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

interface KeyboardHelpProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
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
            <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Search & Navigate</div>
            <Shortcut keys="⌘ K" label="Search everything" />
            <Shortcut keys="⌘ B" label="Toggle sidebar" />
          </div>

          <div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Actions</div>
            <Shortcut keys="⌘ ." label="Toggle Quick Notes" />
          </div>

          <div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">General</div>
            <Shortcut keys="?" label="Show this help" />
            <Shortcut keys="esc" label="Close overlay" />
          </div>

          <div className="text-[11px] text-text-dim pt-2 border-t border-border">
            Use <kbd className="px-1 py-0.5 rounded bg-surface-hover text-[10px]">⌘ K</kbd> to navigate to
            Briefing, Repos, tabs, and run actions like export or new doc.
          </div>
        </div>
      </div>
    </div>
  );
}
