"use client";

import { useState, useEffect, useCallback } from "react";
import { FilePlus2, X, ExternalLink, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  label: string;
}

interface Workspace {
  label: string;
  path: string;
}

interface NewDocModalProps {
  open: boolean;
  onClose: () => void;
}

export function NewDocModal({ open, onClose }: NewDocModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [folder, setFolder] = useState("");
  const [filename, setFilename] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ path: string; cursorUri: string; relativePath: string } | null>(null);

  useEffect(() => {
    if (open) {
      setError("");
      setResult(null);
      setFilename("");
      setFolder("");
      fetch("/api/new-doc")
        .then((r) => r.json())
        .then((d) => {
          setTemplates(d.templates);
          setWorkspaces(d.workspaces);
          if (d.workspaces.length > 0 && !selectedWorkspace) {
            setSelectedWorkspace(d.workspaces[0].label);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const create = useCallback(async () => {
    if (!filename.trim()) { setError("Enter a filename"); return; }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/new-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: selectedWorkspace,
          folder,
          filename: filename.trim(),
          templateId: selectedTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setResult(data);
    } finally {
      setCreating(false);
    }
  }, [filename, selectedWorkspace, folder, selectedTemplate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !result) { e.preventDefault(); create(); }
    if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60" />
      <div
        className="relative bg-surface border border-border rounded-lg shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <FilePlus2 size={16} className="text-accent" />
          <span className="text-[14px] font-semibold text-text">New Document</span>
          <button onClick={onClose} className="ml-auto text-text-dim hover:text-text transition-colors">
            <X size={14} />
          </button>
        </div>

        {result ? (
          <div className="px-5 py-6 text-center">
            <div className="text-[13px] text-text mb-1">Created successfully</div>
            <div className="text-[11px] text-text-dim mb-4 font-mono">{result.relativePath}</div>
            <div className="flex items-center justify-center gap-2">
              <a
                href={result.cursorUri}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium bg-accent text-black hover:bg-accent/90 transition-colors no-underline"
              >
                <FolderOpen size={12} /> Open in Cursor
              </a>
              <a
                href={`/api/file/${result.relativePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] text-text-muted hover:bg-surface-hover transition-colors no-underline"
              >
                <ExternalLink size={12} /> Preview
              </a>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3.5">
            <div>
              <label className="text-[11px] text-text-dim uppercase tracking-wider block mb-1">Template</label>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded border transition-colors",
                      selectedTemplate === t.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-text-muted hover:border-text-dim",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] text-text-dim uppercase tracking-wider block mb-1">Workspace</label>
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-[12px] text-text outline-none focus:border-accent"
              >
                {workspaces.map((w) => (
                  <option key={w.label} value={w.label}>{w.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-text-dim uppercase tracking-wider block mb-1">Folder (optional)</label>
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="e.g. Planning/Fall-2026"
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-[12px] text-text placeholder:text-text-dim outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="text-[11px] text-text-dim uppercase tracking-wider block mb-1">Filename</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => { setFilename(e.target.value); setError(""); }}
                placeholder="my-document.md"
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-[12px] text-text placeholder:text-text-dim outline-none focus:border-accent"
                autoFocus
              />
            </div>

            {error && <div className="text-[11px] text-red">{error}</div>}

            <button
              onClick={create}
              disabled={creating || !filename.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-[12px] font-medium bg-accent text-black hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              <FilePlus2 size={12} />
              {creating ? "Creating..." : "Create Document"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
