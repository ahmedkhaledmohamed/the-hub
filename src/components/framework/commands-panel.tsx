"use client";

import { useState } from "react";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";
import type { FrameworkCommand } from "@/lib/types";

interface CommandsPanelProps {
  commands: FrameworkCommand[];
}

export function CommandsPanel({ commands }: CommandsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 w-full text-left border-b border-border hover:bg-surface-hover transition-colors"
      >
        <Terminal size={14} className="text-cyan-400 shrink-0" />
        <span className="text-[13px] font-semibold text-text">
          Slash Commands
        </span>
        <span className="text-[10px] text-text-dim bg-surface-hover px-2 py-0.5 rounded-full">
          {commands.length}
        </span>
        <span className="text-[10px] text-text-dim ml-1">Claude Code</span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp size={14} className="text-text-dim" />
          ) : (
            <ChevronDown size={14} className="text-text-dim" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-border-subtle">
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <code className="text-[11px] text-accent font-mono shrink-0">
                {cmd.name}
              </code>
              <span className="text-[11px] text-text-muted truncate">
                {cmd.firstLine}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
