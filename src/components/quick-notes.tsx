"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { StickyNote, Save, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { cn } from "@/lib/utils";

interface QuickNotesProps {
  open: boolean;
  onClose: () => void;
}

export function QuickNotes({ open, onClose }: QuickNotesProps) {
  const [content, setContent] = usePersistedState<string>("quick-notes", "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  const saveToFile = useCallback(async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [content]);

  const insertTimestamp = useCallback(() => {
    const ts = `\n\n--- ${new Date().toLocaleString()} ---\n`;
    setContent((prev) => prev + ts);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) { ta.scrollTop = ta.scrollHeight; ta.focus(); }
    }, 50);
  }, [setContent]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[90] bg-surface border border-border rounded-lg shadow-2xl transition-all",
        minimized ? "w-48" : "w-96",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border cursor-pointer select-none"
        onClick={() => setMinimized((v) => !v)}
      >
        <StickyNote size={14} className="text-yellow-400" />
        <span className="text-[12px] font-semibold text-text flex-1">Quick Notes</span>
        <kbd className="text-[9px] text-text-dim bg-surface-hover px-1 py-0.5 rounded">⌘.</kbd>
        {minimized ? <ChevronUp size={12} className="text-text-dim" /> : <ChevronDown size={12} className="text-text-dim" />}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-text-dim hover:text-text transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {!minimized && (
        <>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Jot down anything..."
            className="w-full h-56 px-3 py-2.5 bg-transparent text-[12px] text-text placeholder:text-text-dim resize-none outline-none font-mono leading-relaxed"
            spellCheck={false}
          />
          <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border">
            <button
              onClick={insertTimestamp}
              className="text-[10px] text-text-dim hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-hover"
              title="Insert timestamp"
            >
              + timestamp
            </button>
            <div className="flex-1" />
            {content.trim() && (
              <button
                onClick={() => setContent("")}
                className="text-text-dim hover:text-red transition-colors p-1 rounded hover:bg-surface-hover"
                title="Clear notes"
              >
                <Trash2 size={11} />
              </button>
            )}
            <button
              onClick={saveToFile}
              disabled={saving || !content.trim()}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors",
                saved ? "text-accent" : "text-text-dim hover:text-accent hover:bg-surface-hover",
                "disabled:opacity-40",
              )}
              title="Save to file"
            >
              <Save size={11} />
              {saved ? "Saved!" : saving ? "..." : "Save to file"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
