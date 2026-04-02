import {
  ExternalLink, ArrowRight, FileText, Globe, MessageCircle,
  Kanban, Settings, BookOpen, ClipboardList, Wrench,
  Layout, Zap, BarChart, BellRing, Inbox, Smartphone,
  type LucideIcon, Link2,
} from "lucide-react";
import type { LinksPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  "file-text": FileText,
  globe: Globe,
  "message-circle": MessageCircle,
  kanban: Kanban,
  settings: Settings,
  "book-open": BookOpen,
  clipboard: ClipboardList,
  wrench: Wrench,
  layout: Layout,
  zap: Zap,
  "bar-chart": BarChart,
  bell: BellRing,
  inbox: Inbox,
  smartphone: Smartphone,
  link: Link2,
};

const priorityStyles: Record<string, string> = {
  must: "bg-red/20 text-red",
  should: "bg-orange/20 text-orange",
  could: "bg-blue/20 text-blue",
};

interface LinksPanelProps {
  config: LinksPanelConfig;
}

export function LinksPanel({ config }: LinksPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && (
          <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />
        )}
      </div>
      <div>
        {config.items.map((item, i) => {
          const Icon = iconMap[item.icon || "link"] || Link2;
          const isExternal = item.external ?? item.url.startsWith("http");

          if (item.priority) {
            return (
              <a
                key={i}
                href={item.url}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="flex items-start gap-2.5 px-4 py-2.5 no-underline text-text border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors"
              >
                <span className={cn(
                  "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5",
                  priorityStyles[item.priority] || "bg-surface-hover text-text-dim",
                )}>
                  {item.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">{item.label}</div>
                  {item.description && (
                    <div className="text-[11px] text-text-dim mt-0.5">{item.description}</div>
                  )}
                </div>
              </a>
            );
          }

          return (
            <a
              key={i}
              href={item.url}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              className="flex items-center gap-2.5 px-4 py-2 no-underline text-text border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors text-[13px]"
            >
              <Icon size={15} className="text-text-dim shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.meta && (
                <span className="text-[10px] text-text-dim bg-surface-hover/50 px-2 py-0.5 rounded-full">
                  {item.meta}
                </span>
              )}
              {isExternal ? (
                <ExternalLink size={11} className="text-text-dim shrink-0" />
              ) : (
                <ArrowRight size={11} className="text-text-dim shrink-0" />
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
