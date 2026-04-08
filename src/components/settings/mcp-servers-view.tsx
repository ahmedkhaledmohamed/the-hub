"use client";

import { useEffect, useState } from "react";
import { Plug, ToggleLeft, ToggleRight, Globe, Terminal, RefreshCw } from "lucide-react";

interface McpServer {
  id: string;
  disabled: boolean;
  type: "http" | "stdio";
  url: string | null;
  command: string | null;
  cwd: string | null;
}

interface McpData {
  servers: McpServer[];
  total: number;
  enabled: number;
  disabled: number;
}

export function McpServersView() {
  const [data, setData] = useState<McpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-servers");
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const toggle = async (id: string, currentDisabled: boolean) => {
    setToggling(id);
    try {
      await fetch("/api/mcp-servers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, disabled: !currentDisabled }),
      });
      await fetchData();
    } catch { /* ignore */ }
    setToggling(null);
  };

  if (loading) return <div className="p-8 text-zinc-400">Loading MCP servers...</div>;
  if (!data) return <div className="p-8 text-red-400">Failed to load MCP servers</div>;

  const filtered = data.servers.filter((s) =>
    s.id.toLowerCase().includes(filter.toLowerCase())
  );
  const enabled = filtered.filter((s) => !s.disabled);
  const disabled = filtered.filter((s) => s.disabled);

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6" /> MCP Servers
          </h1>
          <p className="text-zinc-400 mt-1">
            {data.enabled} enabled, {data.disabled} disabled of {data.total} total
          </p>
        </div>
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <input
        type="text"
        placeholder="Filter servers..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-6 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-zinc-500"
      />

      {enabled.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Enabled ({enabled.length})
          </h2>
          <div className="space-y-2">
            {enabled.map((s) => (
              <ServerRow key={s.id} server={s} toggling={toggling === s.id} onToggle={() => toggle(s.id, s.disabled)} />
            ))}
          </div>
        </div>
      )}

      {disabled.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Disabled ({disabled.length})
          </h2>
          <div className="space-y-2">
            {disabled.map((s) => (
              <ServerRow key={s.id} server={s} toggling={toggling === s.id} onToggle={() => toggle(s.id, s.disabled)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServerRow({ server, toggling, onToggle }: { server: McpServer; toggling: boolean; onToggle: () => void }) {
  const Icon = server.type === "http" ? Globe : Terminal;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${server.disabled ? "bg-zinc-900/50 border-zinc-800 opacity-60" : "bg-zinc-900 border-zinc-700"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{server.id}</div>
          <div className="text-xs text-zinc-500 truncate">
            {server.url || `${server.command} ${server.cwd ? `(${server.cwd})` : ""}`}
          </div>
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={toggling}
        className="shrink-0 ml-4 p-1 rounded hover:bg-zinc-700 transition-colors"
        title={server.disabled ? "Enable" : "Disable"}
      >
        {server.disabled
          ? <ToggleLeft className="w-6 h-6 text-zinc-500" />
          : <ToggleRight className="w-6 h-6 text-green-400" />
        }
      </button>
    </div>
  );
}
