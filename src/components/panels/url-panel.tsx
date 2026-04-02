"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, RefreshCw } from "lucide-react";
import type { UrlPanelConfig } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface UrlPanelProps {
  config: UrlPanelConfig;
}

function applyTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ""));
}

export function UrlPanel({ config }: UrlPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(config.url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (config.template) {
        setContent(applyTemplate(config.template, data));
      } else {
        setContent(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [config.url, config.template]);

  useEffect(() => {
    fetchData();
    if (config.refreshInterval && config.refreshInterval > 0) {
      const interval = setInterval(fetchData, config.refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchData, config.refreshInterval]);

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Globe size={14} className="text-text-dim" />
        <span className="text-[13px] font-semibold text-text">{config.title}</span>
        {config.badge && <Badge text={config.badge.text} color={config.badge.color} className="ml-auto" />}
        <button onClick={fetchData} className="text-text-dim hover:text-accent transition-colors ml-auto">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="px-4 py-3">
        {error ? (
          <div className="text-[12px] text-red">{error}</div>
        ) : loading ? (
          <div className="text-[12px] text-text-dim">Loading...</div>
        ) : (
          <div className="text-[12px] text-text-muted whitespace-pre-wrap">{content}</div>
        )}
      </div>
    </div>
  );
}
