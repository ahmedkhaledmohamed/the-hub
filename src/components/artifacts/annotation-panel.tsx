"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle, Send, Loader2, Trash2, Reply,
  ChevronDown, ChevronUp, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface Annotation {
  id: number;
  artifactPath: string;
  author: string;
  content: string;
  lineStart: number | null;
  lineEnd: number | null;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface AnnotationPanelProps {
  artifactPath: string;
}

// ── Component ─────────────────────────────────────────────────────

export function AnnotationPanel({ artifactPath }: AnnotationPanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replies, setReplies] = useState<Record<number, Annotation[]>>({});

  const loadAnnotations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/annotations?path=${encodeURIComponent(artifactPath)}`);
      const data = await res.json();
      setAnnotations(data.annotations || []);
    } catch { /* network error */ }
    setLoading(false);
  }, [artifactPath]);

  useEffect(() => { loadAnnotations(); }, [loadAnnotations]);

  const loadReplies = async (parentId: number) => {
    try {
      const res = await fetch(`/api/annotations?replies=${parentId}`);
      const data = await res.json();
      setReplies((prev) => ({ ...prev, [parentId]: data.replies || [] }));
    } catch { /* network error */ }
  };

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          artifactPath,
          author: author.trim() || "anonymous",
          content: content.trim(),
          parentId: replyTo,
        }),
      });
      setContent("");
      setReplyTo(null);
      await loadAnnotations();
      if (replyTo) await loadReplies(replyTo);
    } catch { /* error */ }
    setSubmitting(false);
  };

  const deleteAnnotation = async (id: number) => {
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    await loadAnnotations();
  };

  return (
    <div className="border-t border-border">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-hover transition-colors text-[12px]"
      >
        <span className="flex items-center gap-2 text-text-dim">
          <MessageCircle size={12} />
          Comments
          {annotations.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-400 text-[10px] font-medium">
              {annotations.length}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Annotation list */}
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-text-dim" />
            </div>
          ) : annotations.length === 0 ? (
            <p className="text-[11px] text-text-muted py-2">No comments yet. Be the first to annotate this document.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {annotations.map((ann) => (
                <AnnotationItem
                  key={ann.id}
                  annotation={ann}
                  replies={replies[ann.id] || []}
                  onLoadReplies={() => loadReplies(ann.id)}
                  onReply={() => setReplyTo(ann.id)}
                  onDelete={() => deleteAnnotation(ann.id)}
                />
              ))}
            </div>
          )}

          {/* Reply indicator */}
          {replyTo && (
            <div className="flex items-center gap-2 text-[10px] text-blue-400 px-2">
              <Reply className="w-3 h-3" />
              Replying to comment #{replyTo}
              <button onClick={() => setReplyTo(null)} className="text-text-dim hover:text-text ml-auto">Cancel</button>
            </div>
          )}

          {/* New annotation form */}
          <div className="space-y-1.5 pt-1 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-24 px-2 py-1.5 bg-surface border border-border rounded text-[11px] text-text placeholder-text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
                placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
                className="flex-1 px-2 py-1.5 bg-surface border border-border rounded text-[11px] text-text placeholder-text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={submitting || !content.trim()}
                className="p-1.5 bg-accent text-black rounded hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Annotation item ───────────────────────────────────────────────

function AnnotationItem({
  annotation,
  replies,
  onLoadReplies,
  onReply,
  onDelete,
}: {
  annotation: Annotation;
  replies: Annotation[];
  onLoadReplies: () => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const [showReplies, setShowReplies] = useState(false);

  const toggleReplies = () => {
    if (!showReplies && replies.length === 0) onLoadReplies();
    setShowReplies(!showReplies);
  };

  return (
    <div className="bg-surface rounded-lg p-2.5">
      <div className="flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-blue-900/40 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-3 h-3 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-medium text-text">{annotation.author}</span>
            <span className="text-[10px] text-text-muted">
              {new Date(annotation.createdAt).toLocaleDateString()}
            </span>
            {annotation.lineStart && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-surface-hover text-text-dim">
                L{annotation.lineStart}{annotation.lineEnd && annotation.lineEnd !== annotation.lineStart ? `-${annotation.lineEnd}` : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-dim leading-relaxed">{annotation.content}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={onReply}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-blue-400 transition-colors"
            >
              <Reply className="w-2.5 h-2.5" /> Reply
            </button>
            <button
              onClick={toggleReplies}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-dim transition-colors"
            >
              {showReplies ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              Replies
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-red-400 transition-colors ml-auto"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Replies */}
          {showReplies && replies.length > 0 && (
            <div className="mt-2 pl-3 border-l border-border space-y-1.5">
              {replies.map((reply) => (
                <div key={reply.id} className="text-[11px]">
                  <span className="font-medium text-text">{reply.author}</span>
                  <span className="text-text-muted ml-2">{reply.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
