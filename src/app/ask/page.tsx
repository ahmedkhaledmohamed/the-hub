"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Sparkles, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Source {
  path: string;
  title: string;
  snippet: string;
}

interface QaEntry {
  question: string;
  answer: string;
  sources: Source[];
  model: string;
}

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QaEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setQuestion("");

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();

      setHistory((prev) => [
        {
          question: q,
          answer: data.answer || data.error || "No response.",
          sources: data.sources || [],
          model: data.model || "unknown",
        },
        ...prev,
      ]);
    } catch {
      setHistory((prev) => [
        {
          question: q,
          answer: "**Error** — could not connect to the AI gateway.",
          sources: [],
          model: "error",
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [question, loading]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Sparkles size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text">Ask your workspace</h1>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-8">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask a question about your documents..."
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-[14px] text-text outline-none focus:border-accent placeholder:text-text-dim"
          disabled={loading}
          autoFocus
        />
        <button
          onClick={ask}
          disabled={loading || !question.trim()}
          className={cn(
            "px-4 py-3 rounded-lg font-medium text-[14px] transition-colors",
            "bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {/* History */}
      {history.length === 0 && !loading && (
        <div className="text-center py-16 text-text-dim text-[13px]">
          <Sparkles size={24} className="mx-auto mb-3 text-text-dim" />
          <p>Ask anything about your workspace documents.</p>
          <p className="mt-1">Answers are grounded in your actual files with source citations.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-[13px] text-text-dim mb-4 animate-pulse">
          <Loader2 size={14} className="animate-spin" />
          Searching workspace and generating answer...
        </div>
      )}

      <div className="space-y-6">
        {history.map((entry, i) => (
          <div key={i} className="space-y-3">
            {/* Question */}
            <div className="flex items-start gap-2">
              <span className="text-[12px] font-semibold text-accent mt-0.5">Q</span>
              <span className="text-[14px] text-text font-medium">{entry.question}</span>
            </div>

            {/* Answer */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <div
                className="text-[13px] text-text-muted leading-relaxed prose-sm"
                dangerouslySetInnerHTML={{
                  __html: formatMarkdown(entry.answer),
                }}
              />
            </div>

            {/* Sources */}
            {entry.sources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entry.sources.map((source) => (
                  <a
                    key={source.path}
                    href={`/api/file/${source.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-text-dim hover:text-accent bg-surface-hover rounded px-2.5 py-1.5 transition-colors no-underline"
                    title={source.snippet}
                  >
                    <FileText size={10} />
                    {source.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:#1e1e1e;padding:2px 6px;border-radius:4px;font-size:0.9em;'>$1</code>")
    .replace(/^### (.+)$/gm, "<h3 style='font-size:14px;font-weight:600;margin:12px 0 4px;'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style='font-size:15px;font-weight:600;margin:16px 0 6px;'>$1</h2>")
    .replace(/^- (.+)$/gm, "<li style='margin-left:16px;'>$1</li>")
    .replace(/\n\n/g, "<br /><br />")
    .replace(/\n/g, "<br />");
}
