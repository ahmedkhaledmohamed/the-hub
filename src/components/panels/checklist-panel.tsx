"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckSquare, Square } from "lucide-react";
import type { ChecklistPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface ChecklistPanelProps {
  config: ChecklistPanelConfig;
}

export function ChecklistPanel({ config }: ChecklistPanelProps) {
  const storageKey = `checklist:${config.persistKey || config.title}`;

  const [checked, setChecked] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(checked)));
    } catch {
      // localStorage unavailable
    }
  }, [checked, storageKey]);

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setChecked(new Set());
  }, []);

  const completedCount = config.items.filter((item) => checked.has(item.id)).length;
  const progress = config.items.length > 0 ? (completedCount / config.items.length) * 100 : 0;

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        <span className="text-[11px] text-text-dim ml-auto">
          {completedCount}/{config.items.length}
        </span>
        {config.badge && (
          <Badge text={config.badge.text} color={config.badge.color} />
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-hover">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="px-4 py-2">
        {config.items.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className="w-full flex items-start gap-2.5 py-1.5 text-left group transition-colors"
            >
              {isChecked ? (
                <CheckSquare size={14} className="text-accent shrink-0 mt-0.5" />
              ) : (
                <Square size={14} className="text-text-dim group-hover:text-text-muted shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <span className={`text-[12px] ${isChecked ? "text-text-dim line-through" : "text-text-muted"}`}>
                  {item.label}
                </span>
                {item.description && (
                  <span className="block text-[10px] text-text-dim mt-0.5">{item.description}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {completedCount > 0 && (
        <div className="px-4 pb-2">
          <button
            onClick={resetAll}
            className="text-[10px] text-text-dim hover:text-accent transition-colors"
          >
            Reset all
          </button>
        </div>
      )}
    </div>
  );
}
