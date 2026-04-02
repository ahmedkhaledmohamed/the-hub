"use client";

import { ChevronRight } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { ArtifactCard } from "./artifact-card";
import { cn } from "@/lib/utils";

interface ArtifactSubgroupProps {
  label: string;
  artifacts: Artifact[];
  collapsed: boolean;
  onToggle: () => void;
  onPreview?: (artifact: Artifact) => void;
  onView?: (path: string, title: string) => void;
  pinnedSet?: Set<string>;
  onTogglePin?: (path: string) => void;
  selectedSet?: Set<string>;
  onToggleSelect?: (path: string) => void;
  selectionMode?: boolean;
}

export function ArtifactSubgroup({
  label,
  artifacts,
  collapsed,
  onToggle,
  onPreview,
  onView,
  pinnedSet,
  onTogglePin,
  selectedSet,
  onToggleSelect,
  selectionMode,
}: ArtifactSubgroupProps) {
  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text transition-colors mb-1 pl-1"
      >
        <ChevronRight
          size={12}
          className={cn(
            "transition-transform duration-150",
            !collapsed && "rotate-90",
          )}
        />
        <span className="font-medium">{label}</span>
        <span className="text-text-dim text-[10px]">({artifacts.length})</span>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5 pl-4">
          {artifacts.map((a) => (
            <ArtifactCard
              key={a.path}
              artifact={a}
              onPreview={onPreview}
              onView={onView}
              pinned={pinnedSet?.has(a.path)}
              onTogglePin={onTogglePin}
              selected={selectedSet?.has(a.path)}
              onToggleSelect={onToggleSelect}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
