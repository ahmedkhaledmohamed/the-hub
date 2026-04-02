"use client";

import type { PanelConfig } from "@/lib/types";
import { TimelinePanel } from "./timeline-panel";
import { LinksPanel } from "./links-panel";
import { ToolsPanel } from "./tools-panel";

interface PanelRendererProps {
  panels: PanelConfig[];
}

export function PanelRenderer({ panels }: PanelRendererProps) {
  if (panels.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 mb-6">
      {panels.map((panel, i) => {
        switch (panel.type) {
          case "timeline":
            return <TimelinePanel key={i} config={panel} />;
          case "links":
            return <LinksPanel key={i} config={panel} />;
          case "tools":
            return <ToolsPanel key={i} config={panel} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
