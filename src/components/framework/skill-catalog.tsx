"use client";

import { useState } from "react";
import { Sparkles, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import type { FrameworkSkill } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SkillCatalogProps {
  skills: FrameworkSkill[];
}

export function SkillCatalog({ skills }: SkillCatalogProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 w-full text-left border-b border-border hover:bg-surface-hover transition-colors"
      >
        <Sparkles size={14} className="text-accent shrink-0" />
        <span className="text-[13px] font-semibold text-text">
          Agent Skills
        </span>
        <span className="text-[10px] text-text-dim bg-surface-hover px-2 py-0.5 rounded-full">
          {skills.length}
        </span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp size={14} className="text-text-dim" />
          ) : (
            <ChevronDown size={14} className="text-text-dim" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 p-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: FrameworkSkill }) {
  const anyInstalled =
    skill.installed.cursor || skill.installed.claude || skill.installed.codex;

  return (
    <div
      className={cn(
        "bg-background border rounded-md px-3 py-2.5 transition-colors",
        anyInstalled ? "border-border" : "border-yellow-500/30",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-text">
              {formatName(skill.name)}
            </span>
            {skill.argumentHint && (
              <span className="text-[10px] text-text-dim font-mono">
                {skill.argumentHint}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
            {truncateDescription(skill.description)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border-subtle">
        <InstallBadge label="Cursor" installed={skill.installed.cursor} />
        <InstallBadge label="Claude" installed={skill.installed.claude} />
        <InstallBadge label="Codex" installed={skill.installed.codex} />
        {skill.allowedTools && (
          <span className="ml-auto text-[9px] text-text-dim font-mono">
            {skill.allowedTools}
          </span>
        )}
      </div>
    </div>
  );
}

function InstallBadge({
  label,
  installed,
}: {
  label: string;
  installed: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded",
        installed
          ? "bg-green-500/15 text-green-400"
          : "bg-surface-hover text-text-dim",
      )}
    >
      {installed ? <Check size={8} /> : <X size={8} />}
      {label}
    </span>
  );
}

function formatName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function truncateDescription(desc: string): string {
  const cleaned = desc
    .replace(/Use when .*$/, "")
    .replace(/Triggers include .*$/, "")
    .trim();
  if (cleaned.length > 120) return cleaned.slice(0, 120) + "...";
  return cleaned || desc.slice(0, 120);
}
