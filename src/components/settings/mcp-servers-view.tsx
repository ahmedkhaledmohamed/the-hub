"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plug, ToggleLeft, ToggleRight, RefreshCw,
  Globe, Terminal, AlertTriangle, CheckCircle,
  XCircle, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface McpServer {
  id: string;
  type: "stdio" | "url";
  url: string | null;
  command: string | null;
  cwd: string | null;
  disabled: boolean;
  cacheStatus: "ok" | "errored" | "no-tools" | "uncached" | "disabled";
  toolCount: number;
  inClaude: boolean;
}

interface McpData {
  servers: McpServer[];
  summary: { total: number; enabled: number; disabled: number; totalTools: number };
  paths: { cursor: string; claude: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ComponentType<{ size: number; className?: string }> }> = {
  ok: { label: "Connected", color: "text-green-400", Icon: CheckCircle },
  errored: { label: "Errored", color: "text-red-400", Icon: XCircle },
  "no-tools": { label: "No tools", color: "text-yellow-400", Icon: AlertTriangle },
  uncached: { label: "Never connected", color: "text-zinc-500", Icon: HelpCircle },
  disabled: { label: "Disabled", color: "text-zinc-600", Icon: XCircle },
};

export function McpServersView() {
  const [data, setData] = useState<McpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/mcp-servers")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (id: string, currentDisabled: boolean) => {
    setToggling(id);
    await fetch("/api/mcp-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, disabled: !currentDisabled }),
    });
    setToggling(null);
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-dim">
        <RefreshCw size={16} className="animate-spin" />
        Loading MCP servers...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-red-400">
        Failed to load MCP server config.
      </div>
    );
  }

  const filtered = data.servers.filter((s) => {
    if (filter === "enabled" && s.disabled) return false;
    if (filter === "disabled" && !s.disabled) return false;
    if (search && !s.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const enabledServers = filtered.filter((s) => !s.disabled);
  const disabledServers = filtered.filter((s) => s.disabled);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plug size={20} className="text-accent" />
            <div>
              <h1 className="text-lg font-semibold text-text">MCP Servers</h1>
              <p className="text-sm text-text-dim">
                Manage Model Context Protocol servers for Cursor and Claude Code
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: data.summary.total, color: "text-text" },
            { label: "Enabled", value: data.summary.enabled, color: "text-green-400" },
            { label: "Disabled", value: data.summary.disabled, color: "text-zinc-500" },
            { label: "Tools", value: data.summary.totalTools, color: "text-accent" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-3 text-center">
              <div className={cn("text-2xl font-bold", color)}>{value}</div>
              <div className="text-xs text-text-dim mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter servers..."
            className="flex-1 px-3 py-1.5 rounded-md border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["all", "enabled", "disabled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 text-xs capitalize transition-colors",
                  filter === f
                    ? "bg-accent text-black font-medium"
                    : "text-text-dim hover:text-text hover:bg-surface-hover",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Enabled servers */}
        {enabledServers.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-text-dim mb-2 flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              Enabled ({enabledServers.length})
            </h2>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {enabledServers.map((s) => (
                <ServerRow key={s.id} server={s} toggling={toggling} onToggle={toggle} />
              ))}
            </div>
          </section>
        )}

        {/* Disabled servers */}
        {disabledServers.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-text-dim mb-2 flex items-center gap-2">
              <XCircle size={14} className="text-zinc-500" />
              Disabled ({disabledServers.length})
            </h2>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {disabledServers.map((s) => (
                <ServerRow key={s.id} server={s} toggling={toggling} onToggle={toggle} />
              ))}
            </div>
          </section>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-dim">
            No servers match your filter.
          </div>
        )}

        {/* Config paths */}
        <div className="text-xs text-text-muted space-y-1 pt-4 border-t border-border">
          <p>Config: <code className="px-1 py-0.5 rounded bg-surface-hover">{data.paths.cursor}</code></p>
          <p className="text-text-muted/60">Changes require restarting Cursor to take effect.</p>
        </div>
      </div>
    </div>
  );
}

function ServerRow({
  server: s,
  toggling,
  onToggle,
}: {
  server: McpServer;
  toggling: string | null;
  onToggle: (id: string, disabled: boolean) => void;
}) {
  const status = STATUS_CONFIG[s.cacheStatus] || STATUS_CONFIG.uncached;
  const StatusIcon = status.Icon;
  const isToggling = toggling === s.id;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 transition-colors",
      s.disabled ? "bg-surface/50 opacity-60" : "bg-surface",
    )}>
      {/* Type icon */}
      <div className="shrink-0" title={s.type === "stdio" ? "Local process (stdio)" : "Remote URL"}>
        {s.type === "stdio" ? (
          <Terminal size={15} className="text-blue-400" />
        ) : (
          <Globe size={15} className="text-text-dim" />
        )}
      </div>

      {/* Name and details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text truncate">{s.id}</span>
          {s.inClaude && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-400 font-medium shrink-0">
              Claude
            </span>
          )}
          {s.toolCount > 0 && !s.disabled && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-medium shrink-0">
              {s.toolCount} tools
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted truncate mt-0.5">
          {s.url || s.command || "\u2014"}
        </div>
      </div>

      {/* Status */}
      <div className={cn("flex items-center gap-1.5 text-xs shrink-0", status.color)} title={status.label}>
        <StatusIcon size={13} />
        <span className="hidden sm:inline">{status.label}</span>
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggle(s.id, s.disabled)}
        disabled={isToggling}
        className={cn(
          "shrink-0 transition-colors",
          isToggling ? "opacity-50" : "hover:opacity-80",
        )}
        title={s.disabled ? "Enable server" : "Disable server"}
      >
        {s.disabled ? (
          <ToggleLeft size={28} className="text-zinc-600" />
        ) : (
          <ToggleRight size={28} className="text-green-400" />
        )}
      </button>
    </div>
  );
}
