"use client";

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import type { MarkdownPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface MarkdownPanelProps {
  config: MarkdownPanelConfig;
}

export function MarkdownPanel({ config }: MarkdownPanelProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/file/${encodeURIComponent(config.file)}?format=html`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setHtml(text);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [config.file]);

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <FileText size={14} className="text-text-dim" />
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />}
      </div>
      <div className="px-4 py-3">
        {error ? (
          <div className="text-[12px] text-red">{error}</div>
        ) : !html ? (
          <div className="text-[12px] text-text-dim">Loading...</div>
        ) : (
          <iframe
            srcDoc={html}
            className="w-full border-0 min-h-[200px]"
            sandbox="allow-same-origin"
            title={config.title}
            onLoad={(e) => {
              const iframe = e.target as HTMLIFrameElement;
              const doc = iframe.contentDocument;
              if (doc) {
                iframe.style.height = `${doc.documentElement.scrollHeight}px`;
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
