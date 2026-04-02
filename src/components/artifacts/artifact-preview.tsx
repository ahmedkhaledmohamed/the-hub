"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!artifact) {
      setContent("");
      return;
    }
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
  }, [artifact]);

  if (!artifact) return null;

  return (
    <div className={cn(
      "fixed inset-y-0 right-0 w-[50vw] max-w-[700px] bg-background border-l border-border",
      "shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200",
    )}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-[13px] font-semibold truncate flex-1">{artifact.title}</h3>
        <a
          href={`/api/file/${artifact.path}`}
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
            title={artifact.title}
          />
        )}
      </div>
    </div>
  );
}
