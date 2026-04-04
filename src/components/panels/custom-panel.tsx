"use client";

import { useState, useEffect } from "react";
import type { CustomPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface CustomPanelProps {
  config: CustomPanelConfig;
}

export function CustomPanel({ config }: CustomPanelProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  // For markdown mode, do simple inline rendering
  useEffect(() => {
    if (config.markdown) {
      // Simple markdown-to-html for basic formatting
      const html = config.markdown
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code style='background:#1e1e1e;padding:2px 6px;border-radius:4px;font-size:0.9em;'>$1</code>")
        .replace(/^### (.+)$/gm, "<h3 style='font-size:14px;font-weight:600;margin:12px 0 4px;'>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2 style='font-size:15px;font-weight:600;margin:16px 0 6px;'>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1 style='font-size:16px;font-weight:700;margin:16px 0 8px;'>$1</h1>")
        .replace(/^- (.+)$/gm, "<li style='margin-left:16px;font-size:12px;color:#999;'>$1</li>")
        .replace(/\n\n/g, "<br /><br />")
        .replace(/\n/g, "<br />");
      setHtmlContent(html);
    }
  }, [config.markdown]);

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && (
          <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />
        )}
      </div>

      {config.url && (
        <iframe
          src={config.url}
          className="w-full border-0"
          style={{ height: config.height || 200 }}
          sandbox="allow-scripts allow-same-origin"
          title={config.title}
        />
      )}

      {config.markdown && htmlContent && (
        <div
          className="px-4 py-3 text-[12px] text-text-muted leading-relaxed"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      )}

      {!config.url && !config.markdown && (
        <div className="px-4 py-8 text-center text-[12px] text-text-dim">
          No content configured. Set <code className="bg-surface-hover px-1 rounded">url</code> or <code className="bg-surface-hover px-1 rounded">markdown</code>.
        </div>
      )}
    </div>
  );
}
