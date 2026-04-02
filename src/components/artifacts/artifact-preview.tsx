"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ArtifactPreviewProps {
  artifact: Artifact | null;
  onClose: () => void;
}

export function ArtifactPreview({ artifact, onClose }: ArtifactPreviewProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (artifact) {
      setVisible(true);
      setLoading(true);
      fetch(`/api/file/${artifact.path}`)
        .then((r) => r.text())
        .then((html) => {
          setContent(html);
          setLoading(false);
        })
        .catch(() => {
          setContent("<p>Failed to load preview.</p>");
          setLoading(false);
        });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setContent(""), 200);
      return () => clearTimeout(timer);
    }
  }, [artifact]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && artifact) {
        onClose();
      }
    },
    [artifact, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  if (!artifact && !visible) return null;

  const pathSegments = artifact?.path.split("/") ?? [];

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed inset-y-0 right-0 w-[50vw] max-w-[700px] bg-background border-l border-border",
          "shadow-2xl z-50 flex flex-col transition-transform duration-200",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold truncate">
              {artifact?.title}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-text-dim mt-0.5">
              {pathSegments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-text-dim">/</span>}
                  <span
                    className={
                      i === pathSegments.length - 1
                        ? "text-text-muted"
                        : ""
                    }
                  >
                    {seg}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <a
            href={artifact ? `/api/file/${artifact.path}` : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-dim hover:text-text"
          >
            <ExternalLink size={14} />
          </a>
          <button onClick={onClose} className="text-text-dim hover:text-text">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-text-dim" />
            </div>
          ) : (
            <iframe
              srcDoc={content}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
              title={artifact?.title || "Preview"}
            />
          )}
        </div>
      </div>
    </>
  );
}
