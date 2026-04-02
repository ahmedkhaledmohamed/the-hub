"use client";

import { useState } from "react";
import {
  Server, Check, X, ChevronDown, ChevronUp, Lock, Globe,
} from "lucide-react";
import type { McpServerEntry, McpTier } from "@/lib/types";
import { cn } from "@/lib/utils";

interface McpCatalogProps {
  servers: McpServerEntry[];
  tiers: Record<string, McpTier>;
}

const tierOrder = [
  "zero-config",
  "spotify-internal",
  "pm-essentials",
  "data-analytics",
];

const tierColors: Record<string, string> = {
  "zero-config": "bg-green-500/15 text-green-400",
  "spotify-internal": "bg-blue-500/15 text-blue-400",
  "pm-essentials": "bg-purple-500/15 text-purple-400",
  "data-analytics": "bg-orange-500/15 text-orange-400",
};

export function McpCatalog({ servers, tiers }: McpCatalogProps) {
  const [expanded, setExpanded] = useState(true);

  const grouped = tierOrder
    .map((tierId) => ({
      tierId,
      tier: tiers[tierId],
      servers: servers.filter((s) => s.tier === tierId),
    }))
    .filter((g) => g.servers.length > 0);

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden mb-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 w-full text-left border-b border-border hover:bg-surface-hover transition-colors"
      >
        <Server size={14} className="text-purple-400 shrink-0" />
        <span className="text-[13px] font-semibold text-text">
          MCP Servers
        </span>
        <span className="text-[10px] text-text-dim bg-surface-hover px-2 py-0.5 rounded-full">
          {servers.length}
        </span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp size={14} className="text-text-dim" />
          ) : (
            <ChevronDown size={14} className="text-text-dim" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="p-3 space-y-4">
          {grouped.map(({ tierId, tier, servers: tierServers }) => (
            <div key={tierId}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase px-2 py-0.5 rounded",
                    tierColors[tierId] || "bg-surface-hover text-text-dim",
                  )}
                >
                  {tier?.label || tierId}
                </span>
                <span className="text-[10px] text-text-dim">
                  {tier?.description}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
                {tierServers.map((server) => (
                  <McpCard key={server.id} server={server} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function McpCard({ server }: { server: McpServerEntry }) {
  return (
    <div
      className={cn(
        "bg-background border rounded-md px-3 py-2.5",
        server.configured ? "border-border" : "border-border",
      )}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-text">
              {server.name}
            </span>
            {server.transport === "url" ? (
              <span title="Remote server"><Globe size={10} className="text-text-dim" /></span>
            ) : (
              <span title="Local (stdio)"><Server size={10} className="text-text-dim" /></span>
            )}
          </div>
          <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">
            {server.pmUseCase}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {server.needsCredentials && (
            <span title="Needs credentials"><Lock size={10} className="text-yellow-400" /></span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded",
              server.configured
                ? "bg-green-500/15 text-green-400"
                : "bg-surface-hover text-text-dim",
            )}
          >
            {server.configured ? <Check size={8} /> : <X size={8} />}
            {server.configured ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
    </div>
  );
}
