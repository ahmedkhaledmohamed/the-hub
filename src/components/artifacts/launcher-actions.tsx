"use client";

import { useState, useEffect } from "react";
import { Code, Terminal, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface LauncherActionsProps {
  artifactPath: string;
  compact?: boolean;
}

interface ResolvedPath {
  absPath: string;
  dirPath: string;
}

export function LauncherActions({ artifactPath, compact }: LauncherActionsProps) {
  const [resolved, setResolved] = useState<ResolvedPath | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!artifactPath) return;
    fetch(`/api/resolve?path=${encodeURIComponent(artifactPath)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.absPath) setResolved(data);
      })
      .catch(() => {});
  }, [artifactPath]);

  if (!resolved) return null;

  const cursorUri = `cursor://file${resolved.absPath}`;

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(`cd ${resolved.dirPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access may fail
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        <a
          href={cursorUri}
          className="p-1 rounded text-text-dim hover:text-accent hover:bg-surface-hover transition-colors"
          onClick={(e) => e.stopPropagation()}
          title="Open in Cursor"
        >
          <Code size={12} />
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={cursorUri}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]",
          "bg-surface-hover text-text-muted hover:text-accent hover:bg-accent/10 transition-colors",
        )}
        title="Open in Cursor"
      >
        <Code size={12} />
        Cursor
      </a>
      <button
        onClick={copyPath}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]",
          "bg-surface-hover text-text-muted hover:text-accent hover:bg-accent/10 transition-colors",
        )}
        title="Copy cd command"
      >
        {copied ? <Check size={12} /> : <Terminal size={12} />}
        {copied ? "Copied" : "Terminal"}
      </button>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(resolved.absPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]",
          "bg-surface-hover text-text-muted hover:text-accent hover:bg-accent/10 transition-colors",
        )}
        title="Copy absolute path"
      >
        <Copy size={12} />
        Path
      </button>
    </div>
  );
}
