"use client";

import type { Artifact, ManifestGroup } from "@/lib/types";
import { ArtifactCard } from "./artifact-card";

interface ArtifactGridProps {
  group: ManifestGroup;
  artifacts: Artifact[];
  onPreview?: (artifact: Artifact) => void;
}

export function ArtifactGrid({ group, artifacts, onPreview }: ArtifactGridProps) {
  if (artifacts.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
        <h2 className="text-[14px] font-semibold" style={{ color: group.color }}>
          {group.label}
        </h2>
        <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
          {artifacts.length}
        </span>
        {group.description && (
          <span className="text-[12px] text-text-muted ml-auto hidden sm:inline">
            {group.description}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
        {artifacts.map((a) => (
          <ArtifactCard key={a.path} artifact={a} onPreview={onPreview} />
        ))}
      </div>
    </section>
  );
}
