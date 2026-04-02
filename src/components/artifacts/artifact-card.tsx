"use client";

import type { Artifact } from "@/lib/types";
import { relativeTime, cn, stalenessInfo } from "@/lib/utils";
import { Star } from "lucide-react";
import { LauncherActions } from "./launcher-actions";

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
  pinned?: boolean;
  onTogglePin?: (path: string) => void;
  selected?: boolean;
  onToggleSelect?: (path: string) => void;
  selectionMode?: boolean;
}

export function ArtifactCard({
  artifact,
  onPreview,
  onView,
  pinned,
  onTogglePin,
  selected,
  onToggleSelect,
  selectionMode,
}: ArtifactCardProps) {
  const previewable = artifact.type === "md" || artifact.type === "html";
  const staleness = stalenessInfo(artifact.staleDays);

  const handleClick = (e: React.MouseEvent) => {
    if (selectionMode && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(artifact.path);
      return;
    }
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
        "flex items-center gap-2.5 px-3 py-2 bg-surface border rounded-md",
        "no-underline text-text hover:border-border hover:bg-surface-hover transition-colors",
        "overflow-hidden group",
        selected ? "border-accent bg-accent/5" : "border-transparent",
      )}
      title={artifact.title}
    >
      {selectionMode && (
        <span className={cn(
          "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px]",
          selected ? "bg-accent border-accent text-white" : "border-text-dim",
        )}>
          {selected && "✓"}
        </span>
      )}
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: staleness.color }}
        title={`${staleness.label} (${artifact.staleDays}d)`}
      />
      <span className={cn(
        "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
        typeStyles[artifact.type] || "bg-surface-hover text-text-dim",
      )}>
        {artifact.type}
      </span>
      <span className="text-[12px] font-medium truncate flex-1">
        {artifact.title}
      </span>
      {onTogglePin && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(artifact.path); }}
          className={cn(
            "shrink-0 transition-colors",
            pinned
              ? "text-yellow-400 hover:text-yellow-300"
              : "text-transparent group-hover:text-text-dim hover:!text-yellow-400",
          )}
          title={pinned ? "Unpin" : "Pin"}
        >
          <Star size={12} fill={pinned ? "currentColor" : "none"} />
        </button>
      )}
      <span className="text-[10px] text-text-dim shrink-0 group-hover:hidden">
        {relativeTime(artifact.modifiedAt)}
      </span>
      <span className="hidden group-hover:flex shrink-0">
        <LauncherActions artifactPath={artifact.path} compact />
      </span>
    </a>
  );
}
