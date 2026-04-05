"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity, Database, Brain, Search, Link2, Briefcase,
  CheckCircle2, XCircle, Loader2, RefreshCw, Clock, HardDrive,
  Server, Cpu, Zap, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface SystemStatus {
  server: { uptime: number; startedAt: string; nodeVersion: string; platform: string };
  database: { artifactCount: number; dbSizeBytes: number; tables: Array<{ name: string; rowCount: number }> };
  scan: { lastScanReason: string | null; artifactCount: number; workspaces: Array<{ path: string; label: string }> };
  ai: { configured: boolean; provider: string | null; model: string | null; ollamaDetected: boolean };
  integrations: Array<{ name: string; configured: boolean; envVar: string }>;
  jobs: { pending: number; running: number; failed: number; completed: number };
  features: { total: number; available: number; list: Array<{ name: string; available: boolean }> };
}

// ── Component ─────────────────────────────────────────────────────

export function StatusView() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status");
      setStatus(await res.json());
      setLastRefresh(new Date());
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!status) return null;

  const healthScore = Math.round(
    (status.features.available / status.features.total) * 50 +
    (status.database.artifactCount > 0 ? 25 : 0) +
    (status.ai.configured ? 25 : 10)
  );

  const healthColor = healthScore >= 80 ? "text-green-400" : healthScore >= 50 ? "text-yellow-400" : "text-red-400";
  const healthLabel = healthScore >= 80 ? "Healthy" : healthScore >= 50 ? "Partial" : "Needs Setup";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-400" /> System Status
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 30s
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className={cn("text-3xl font-bold", healthColor)}>{healthScore}%</div>
            <div className="text-right">
              <p className={cn("font-semibold", healthColor)}>{healthLabel}</p>
              <p className="text-xs text-zinc-500">{status.features.available}/{status.features.total} features</p>
            </div>
            <button onClick={load} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Server */}
          <Card title="Server" icon={<Server className="w-4 h-4" />}>
            <Stat label="Uptime" value={formatUptime(status.server.uptime)} />
            <Stat label="Started" value={new Date(status.server.startedAt).toLocaleString()} />
            <Stat label="Node.js" value={status.server.nodeVersion} />
            <Stat label="Platform" value={status.server.platform} />
          </Card>

          {/* Database */}
          <Card title="Database" icon={<Database className="w-4 h-4" />}>
            <Stat label="Artifacts" value={status.database.artifactCount.toLocaleString()} />
            <Stat label="DB Size" value={formatBytes(status.database.dbSizeBytes)} />
            <Stat label="Tables" value={`${status.database.tables.length}`} />
            <div className="mt-2 max-h-32 overflow-y-auto">
              {status.database.tables.map((t) => (
                <div key={t.name} className="flex justify-between text-xs text-zinc-500 py-0.5">
                  <span className="font-mono">{t.name}</span>
                  <span>{t.rowCount >= 0 ? t.rowCount.toLocaleString() : "?"} rows</span>
                </div>
              ))}
            </div>
          </Card>

          {/* AI Provider */}
          <Card title="AI Provider" icon={<Brain className="w-4 h-4" />}>
            <StatusBadge ok={status.ai.configured} label={status.ai.configured ? "Configured" : "Not configured"} />
            {status.ai.provider && <Stat label="Provider" value={status.ai.provider} />}
            {status.ai.model && <Stat label="Model" value={status.ai.model} />}
            <StatusBadge ok={status.ai.ollamaDetected} label={status.ai.ollamaDetected ? "Ollama detected" : "Ollama not found"} />
          </Card>

          {/* Scan */}
          <Card title="Workspace Scan" icon={<Search className="w-4 h-4" />}>
            <Stat label="Artifacts" value={status.scan.artifactCount.toLocaleString()} />
            {status.scan.lastScanReason && <Stat label="Last Reason" value={status.scan.lastScanReason} />}
            <Stat label="Workspaces" value={`${status.scan.workspaces.length}`} />
            {status.scan.workspaces.map((w) => (
              <div key={w.path} className="text-xs text-zinc-500 py-0.5 truncate">
                {w.label || w.path}
              </div>
            ))}
          </Card>

          {/* Integrations */}
          <Card title="Integrations" icon={<Link2 className="w-4 h-4" />}>
            {status.integrations.map((int) => (
              <div key={int.name} className="flex items-center justify-between py-1">
                <span className="text-sm">{int.name}</span>
                <StatusBadge ok={int.configured} label={int.configured ? "Connected" : int.envVar} small />
              </div>
            ))}
          </Card>

          {/* Job Queue */}
          <Card title="Job Queue" icon={<Briefcase className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Pending" value={status.jobs.pending} color="text-yellow-400" />
              <MiniStat label="Running" value={status.jobs.running} color="text-blue-400" />
              <MiniStat label="Failed" value={status.jobs.failed} color="text-red-400" />
              <MiniStat label="Completed" value={status.jobs.completed} color="text-green-400" />
            </div>
          </Card>

          {/* Features — full width */}
          <div className="md:col-span-2">
            <Card title={`Features (${status.features.available}/${status.features.total} available)`} icon={<Zap className="w-4 h-4" />}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {status.features.list.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-sm py-1">
                    {f.available ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                    )}
                    <span className={f.available ? "text-zinc-200" : "text-zinc-600"}>{f.name}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3 text-blue-400">
        {icon}
        <h3 className="font-semibold text-sm text-zinc-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 font-mono text-xs">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

function StatusBadge({ ok, label, small }: { ok: boolean; label: string; small?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5 py-0.5", small ? "text-xs" : "text-sm")}>
      {ok ? (
        <CheckCircle2 className={cn("text-green-400 shrink-0", small ? "w-3 h-3" : "w-4 h-4")} />
      ) : (
        <XCircle className={cn("text-zinc-600 shrink-0", small ? "w-3 h-3" : "w-4 h-4")} />
      )}
      <span className={ok ? "text-zinc-300" : "text-zinc-600"}>{label}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
