"use client";

import { ExternalLink } from "lucide-react";
import type { EmbedPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface EmbedPanelProps {
  config: EmbedPanelConfig;
}

export function EmbedPanel({ config }: EmbedPanelProps) {
  const height = config.height || 300;

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <ExternalLink size={14} className="text-text-dim" />
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />}
      </div>
      <iframe
        src={config.url}
        className="w-full border-0"
        style={{ height }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        title={config.title}
        loading="lazy"
      />
    </div>
  );
}
