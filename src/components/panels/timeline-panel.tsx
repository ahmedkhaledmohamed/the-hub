import type { TimelinePanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TimelinePanelProps {
  config: TimelinePanelConfig;
}

export function TimelinePanel({ config }: TimelinePanelProps) {
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && (
          <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />
        )}
      </div>
      <div className="px-4 py-3">
        {config.items.map((item, i) => (
          <div key={i} className="flex gap-3 py-1.5 text-[12px] relative">
            {i < config.items.length - 1 && (
              <div className="absolute left-[38px] top-6 bottom-[-4px] w-px bg-border" />
            )}
            <span className={cn(
              "w-11 shrink-0 text-right font-semibold text-[11px]",
              item.status === "active" ? "text-accent" : "text-text-dim",
            )}>
              {item.date}
            </span>
            <span className={cn(
              "w-[7px] h-[7px] rounded-full shrink-0 mt-1",
              item.status === "active" ? "bg-accent" :
              item.status === "past" ? "bg-text-dim" : "bg-border",
            )} />
            <span
              className="flex-1 text-text-muted [&>strong]:text-text [&>strong]:font-medium"
              dangerouslySetInnerHTML={{ __html: item.text }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
