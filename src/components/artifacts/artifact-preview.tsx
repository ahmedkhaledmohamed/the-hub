"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, ExternalLink, Loader2, FileText, Clock, HardDrive, AlertTriangle } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { LauncherActions } from "./launcher-actions";
import { ReviewPanel } from "./review-panel";
import { AnnotationPanel } from "./annotation-panel";

const MAX_PREVIEW_SIZE = 500_000; // 500KB — truncate larger content

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onClose: () => void;
}

export function ArtifactPreview({ artifact, onClose }: ArtifactPreviewProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [contentSize, setContentSize] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const hasHistoryEntry = useRef(false);
  const closingProgrammatically = useRef(false);

  useEffect(() => {
    if (artifact) {
      setVisible(true);
      setLoading(true);
      setTruncated(false);
      setFullContent(null);
      setContentSize(0);

      if (!hasHistoryEntry.current) {
        window.history.pushState({ hubPreview: true }, "");
        hasHistoryEntry.current = true;
      }

      fetch(`/api/file/${artifact.path}`)
        .then(async (r) => {
          const html = await r.text();
          const size = new Blob([html]).size;
          setContentSize(size);

          if (size > MAX_PREVIEW_SIZE) {
            // Truncate and keep full version for "Load full" button
            setContent(html.slice(0, MAX_PREVIEW_SIZE) + "\n<!-- truncated -->");
            setFullContent(html);
            setTruncated(true);
          } else {
            setContent(html);
          }
          setLoading(false);
        })
        .catch(() => {
          setContent("<p>Failed to load preview.</p>");
          setLoading(false);
        });
    } else {
      setVisible(false);
      hasHistoryEntry.current = false;
      const timer = setTimeout(() => {
        setContent("");
        setFullContent(null);
        setTruncated(false);
        setContentSize(0);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [artifact]);

  const loadFullContent = useCallback(() => {
    if (fullContent) {
      setLoadingFull(true);
      // Use requestAnimationFrame to let the UI update before heavy DOM work
      requestAnimationFrame(() => {
        setContent(fullContent);
        setTruncated(false);
        setLoadingFull(false);
      });
    }
  }, [fullContent]);

  useEffect(() => {
    const handlePopState = () => {
      if (closingProgrammatically.current) {
        closingProgrammatically.current = false;
        return;
      }
      if (artifact) {
        hasHistoryEntry.current = false;
        onClose();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [artifact, onClose]);

  const closePreview = useCallback(() => {
    onClose();
    if (hasHistoryEntry.current) {
      hasHistoryEntry.current = false;
      closingProgrammatically.current = true;
      window.history.back();
    }
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && artifact) {
        closePreview();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [artifact, closePreview]);

  if (!artifact && !visible) return null;

  const pathSegments = artifact?.path.split("/") ?? [];

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={closePreview}
      />
      <div
        className={cn(
          "fixed inset-y-0 right-0 w-[50vw] max-w-[700px] bg-background border-l border-border",
          "shadow-2xl z-50 flex flex-col transition-transform duration-200",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold truncate">
              {artifact?.title}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-text-dim mt-0.5">
              {pathSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-text-dim">/</span>}
                  <span className={i === pathSegments.length - 1 ? "text-text-muted" : ""}>
                    {seg}
                  </span>
                </span>
              ))}
              {contentSize > 0 && (
                <span className="ml-2 text-text-muted flex items-center gap-0.5">
                  <HardDrive size={8} />
                  {formatSize(contentSize)}
                </span>
              )}
              {artifact && (
                <span className="ml-1 text-text-muted flex items-center gap-0.5">
                  <Clock size={8} />
                  {relativeTime(artifact.modifiedAt)}
                </span>
              )}
            </div>
          </div>
          {artifact && <LauncherActions artifactPath={artifact.path} />}
          <a
            href={artifact ? `/api/file/${artifact.path}` : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-dim hover:text-text"
          >
            <ExternalLink size={14} />
          </a>
          <button onClick={closePreview} className="text-text-dim hover:text-text">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 relative">
            {loading ? (
              <LoadingSkeleton />
            ) : (
              <>
                <iframe
                  srcDoc={content}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  title={artifact?.title || "Preview"}
                />
                {truncated && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background to-transparent pt-12 pb-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-[11px] text-yellow-400 mb-2">
                      <AlertTriangle size={12} />
                      Content truncated ({formatSize(contentSize)} total)
                    </div>
                    <button
                      onClick={loadFullContent}
                      disabled={loadingFull}
                      className="px-4 py-1.5 bg-surface border border-border rounded-md text-[12px] text-text hover:border-accent transition-colors disabled:opacity-50"
                    >
                      {loadingFull ? (
                        <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading...</span>
                      ) : (
                        "Load full content"
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {artifact && <AnnotationPanel artifactPath={artifact.path} />}
          {artifact && <ReviewPanel artifactPath={artifact.path} />}
        </div>
      </div>
    </>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <FileText size={16} className="text-text-muted" />
        <div className="h-4 bg-surface-hover rounded w-48" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-surface-hover rounded w-full" />
        <div className="h-3 bg-surface-hover rounded w-5/6" />
        <div className="h-3 bg-surface-hover rounded w-4/6" />
        <div className="h-3 bg-surface-hover rounded w-full" />
        <div className="h-3 bg-surface-hover rounded w-3/4" />
      </div>
      <div className="space-y-2 pt-2">
        <div className="h-3 bg-surface-hover rounded w-full" />
        <div className="h-3 bg-surface-hover rounded w-5/6" />
        <div className="h-3 bg-surface-hover rounded w-2/3" />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
