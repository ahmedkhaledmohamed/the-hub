"use client";

import type { Artifact } from "@/lib/types";
import { relativeTime, cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

const typeStyles: Record<string, string> = {
  html: "bg-accent/20 text-accent",
  svg: "bg-blue/20 text-blue",
  md: "bg-purple/20 text-purple",
  csv: "bg-orange/20 text-orange",
};

interface ArtifactCardProps {
  artifact: Artifact;
  onPreview?: (artifact: Artifact) => void;
  onView?: (path: string, title: string) => void;
}

export function ArtifactCard({ artifact, onPreview, onView }: ArtifactCardProps) {
  const previewable = artifact.type === "md" || artifact.type === "html";

  const handleClick = (e: React.MouseEvent) => {
    onView?.(artifact.path, artifact.title);
    if (onPreview && previewable) {
      e.preventDefault();
      onPreview(artifact);
    }
  };

  return (
    <a
      href={`/api/file/${artifact.path}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 bg-surface border border-transparent rounded-md",
        "no-underline text-text hover:border-border hover:bg-surface-hover transition-colors",
        "overflow-hidden group",
      )}
      title={artifact.title}
    >
      <span className={cn(
        "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
        typeStyles[artifact.type] || "bg-surface-hover text-text-dim",
      )}>
        {artifact.type}
      </span>
      <span className="text-[12px] font-medium truncate flex-1">
        {artifact.title}
      </span>
      {artifact.staleDays > 60 && (
        <AlertTriangle size={12} className="text-orange shrink-0" />
      )}
      <span className="text-[10px] text-text-dim shrink-0">
        {relativeTime(artifact.modifiedAt)}
      </span>
    </a>
  );
}
