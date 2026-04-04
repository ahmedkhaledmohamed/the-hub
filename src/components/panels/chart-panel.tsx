"use client";

import type { ChartPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface ChartPanelProps {
  config: ChartPanelConfig;
}

function Sparkline({ data, color = "#3b82f6", width = 200, height = 40 }: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");

  // Area fill
  const areaD = `${pathD} L${width - padding},${height - padding} L${padding},${height - padding} Z`;

  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace("#", "")})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle
        cx={parseFloat(points[points.length - 1].split(",")[0])}
        cy={parseFloat(points[points.length - 1].split(",")[1])}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

export function ChartPanel({ config }: ChartPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && (
          <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        {config.series.map((series, i) => {
          const latest = series.data[series.data.length - 1];
          const prev = series.data.length > 1 ? series.data[series.data.length - 2] : latest;
          const delta = latest - prev;
          const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] text-text-muted">{series.label}</span>
                  <span className="text-[18px] font-bold text-text tabular-nums">{latest}</span>
                  {delta !== 0 && (
                    <span className={`text-[11px] tabular-nums ${delta > 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                      {deltaStr}
                    </span>
                  )}
                </div>
                <Sparkline
                  data={series.data}
                  color={series.color || "#3b82f6"}
                  width={220}
                  height={config.height || 36}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
