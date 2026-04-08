import {
  ExternalLink, BarChart, Zap, Layout, Globe,
  type LucideIcon, Wrench, GitBranch, Layers,
} from "lucide-react";
import type { ToolsPanelConfig, ToolConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const iconMap: Record<string, LucideIcon> = {
  "bar-chart": BarChart,
  chart: BarChart,
  zap: Zap,
  layout: Layout,
  globe: Globe,
  wrench: Wrench,
  "git-branch": GitBranch,
  layers: Layers,
};

interface ToolsPanelProps {
  config: ToolsPanelConfig;
}

export function ToolsPanel({ config }: ToolsPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && (
          <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
        {config.items.map((tool, i) => (
          <ToolCard key={i} tool={tool} />
        ))}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolConfig }) {
  const Icon = iconMap[tool.icon || "globe"] || Globe;

  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-3 bg-background border border-border rounded-md no-underline text-text hover:border-accent hover:bg-surface-hover transition-colors"
    >
      <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
        <Icon size={16} className="text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium">{tool.label}</div>
        {tool.description && (
          <div className="text-[11px] text-text-muted">{tool.description}</div>
        )}
      </div>
      <ExternalLink size={11} className="text-text-dim shrink-0" />
    </a>
  );
}
