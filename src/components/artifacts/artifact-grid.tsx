"use client";

import { useMemo } from "react";
import type { Artifact, ManifestGroup } from "@/lib/types";
import { ArtifactCard } from "./artifact-card";
import { ArtifactSubgroup } from "./artifact-subgroup";
import { usePersistedState } from "@/hooks/use-persisted-state";

const SUBGROUP_THRESHOLD = 20;

interface ArtifactGridProps {
  group: ManifestGroup;
  artifacts: Artifact[];
  onPreview?: (artifact: Artifact) => void;
  onView?: (path: string, title: string) => void;
  pinnedSet?: Set<string>;
  onTogglePin?: (path: string) => void;
  selectedSet?: Set<string>;
  onToggleSelect?: (path: string) => void;
  selectionMode?: boolean;
}

function buildSubgroups(
  artifacts: Artifact[],
): Map<string, Artifact[]> {
  const map = new Map<string, Artifact[]>();

  for (const a of artifacts) {
    const afterPrefix = a.path.split("/").slice(1);
    const subdir = afterPrefix.length > 1 ? afterPrefix[0] : "__root__";
    if (!map.has(subdir)) map.set(subdir, []);
    map.get(subdir)!.push(a);
  }

  return map;
}

export function ArtifactGrid({
  group,
  artifacts,
  onPreview,
  onView,
  pinnedSet,
  onTogglePin,
  selectedSet,
  onToggleSelect,
  selectionMode,
}: ArtifactGridProps) {
  const [collapsed, setCollapsed] = usePersistedState<Record<string, boolean>>(
    `collapsed:${group.id}`,
    {},
  );

  const subgroups = useMemo(
    () => buildSubgroups(artifacts),
    [artifacts],
  );

  const useHierarchy =
    artifacts.length > SUBGROUP_THRESHOLD && subgroups.size > 1;

  if (artifacts.length === 0) return null;

  const toggleSubgroup = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
        <h2
          className="text-[14px] font-semibold"
          style={{ color: group.color }}
        >
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

      {useHierarchy ? (
        <div>
          {Array.from(subgroups.entries())
            .sort(([a], [b]) => {
              if (a === "__root__") return 1;
              if (b === "__root__") return -1;
              return a.localeCompare(b);
            })
            .map(([subdir, items]) => (
              <ArtifactSubgroup
                key={subdir}
                label={subdir === "__root__" ? "Root files" : subdir}
                artifacts={items}
                collapsed={!!collapsed[subdir]}
                onToggle={() => toggleSubgroup(subdir)}
                onPreview={onPreview}
                onView={onView}
                pinnedSet={pinnedSet}
                onTogglePin={onTogglePin}
                selectedSet={selectedSet}
                onToggleSelect={onToggleSelect}
                selectionMode={selectionMode}
              />
            ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-1.5">
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
    </section>
  );
}
