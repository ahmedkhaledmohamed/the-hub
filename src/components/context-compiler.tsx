"use client";

import { useState, useCallback } from "react";
import { Package, Clipboard, Download, X, Loader2 } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ContextCompilerProps {
  selectedPaths: Set<string>;
  artifacts: Artifact[];
  onClear: () => void;
}

export function ContextCompiler({ selectedPaths, artifacts, onClear }: ContextCompilerProps) {
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedArtifacts = artifacts.filter((a) => selectedPaths.has(a.path));

  const compile = useCallback(async () => {
    setCompiling(true);
    try {
      const res = await fetch("/api/compile-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: Array.from(selectedPaths) }),
      });
      const data = await res.json();
      setCompiled(data.compiled);
    } finally {
      setCompiling(false);
    }
  }, [selectedPaths]);

  const copyToClipboard = async () => {
    if (!compiled) return;
    await navigator.clipboard.writeText(compiled);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    if (!compiled) return;
    const blob = new Blob([compiled], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `context-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-5 bg-surface border border-accent/30 rounded-md overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Package size={14} className="text-accent" />
        <span className="text-[13px] font-semibold text-text">Context Compiler</span>
        <span className="text-[11px] text-text-dim">
          {selectedPaths.size} artifact{selectedPaths.size !== 1 ? "s" : ""} selected
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {!compiled ? (
            <button
              onClick={compile}
              disabled={compiling}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors",
                "bg-accent text-black hover:bg-accent/90 disabled:opacity-50",
              )}
            >
              {compiling ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
              Compile
            </button>
          ) : (
            <>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[12px] text-text-muted hover:bg-surface-hover transition-colors"
              >
                <Clipboard size={12} />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={downloadFile}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[12px] text-text-muted hover:bg-surface-hover transition-colors"
              >
                <Download size={12} />
                Download
              </button>
            </>
          )}
          <button
            onClick={onClear}
            className="text-text-dim hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
        {selectedArtifacts.map((a) => (
          <span
            key={a.path}
            className="text-[11px] px-2 py-0.5 bg-surface-hover rounded text-text-muted"
          >
            {a.title}
          </span>
        ))}
      </div>

      {compiled && (
        <div className="border-t border-border">
          <details className="px-4 py-2">
            <summary className="text-[11px] text-text-dim cursor-pointer hover:text-text-muted">
              Preview compiled output ({(compiled.length / 1024).toFixed(1)} KB)
            </summary>
            <pre className="mt-2 text-[11px] text-text-dim max-h-60 overflow-auto whitespace-pre-wrap font-mono bg-surface-hover rounded p-3">
              {compiled.slice(0, 3000)}
              {compiled.length > 3000 && "\n\n... truncated in preview ..."}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
