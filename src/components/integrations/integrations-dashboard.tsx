"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, FileText,
  MessageSquare, Calendar, Lock, Link2, ExternalLink, Zap, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface EnvVar {
  name: string;
  set: boolean;
  required: boolean;
}

interface IntegrationStatus {
  name: string;
  id: string;
  configured: boolean;
  envVars: EnvVar[];
  summary: Record<string, unknown>;
  actions: string[];
}

interface IntegrationsData {
  integrations: IntegrationStatus[];
  configured: number;
  total: number;
}

const ICONS: Record<string, React.ReactNode> = {
  "google-docs": <FileText className="w-5 h-5" />,
  notion: <FileText className="w-5 h-5" />,
  slack: <MessageSquare className="w-5 h-5" />,
  calendar: <Calendar className="w-5 h-5" />,
  sso: <Lock className="w-5 h-5" />,
};

const DESCRIPTIONS: Record<string, string> = {
  "google-docs": "Bidirectional sync between Google Docs and Hub artifacts.",
  notion: "Real-time page sync with Notion databases and pages.",
  slack: "Post change summaries and receive slash commands.",
  calendar: "Surface today's meetings and auto-link related artifacts.",
  sso: "SAML 2.0 single sign-on for enterprise authentication.",
};

// ── Component ─────────────────────────────────────────────────────

export function IntegrationsDashboard() {
  const [data, setData] = useState<IntegrationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string; latencyMs: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations");
      setData(await res.json());
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async (integrationId: string) => {
    setSyncing(integrationId);
    setSyncResult((prev) => ({ ...prev, [integrationId]: undefined as unknown as { ok: boolean; msg: string } }));
    try {
      const endpoint = integrationId === "google-docs" ? "/api/google-docs" : "/api/notion";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-all" }),
      });
      const result = await res.json();
      setSyncResult((prev) => ({
        ...prev,
        [integrationId]: { ok: true, msg: `Synced ${result.results?.length || 0} items` },
      }));
      await load();
    } catch (err) {
      setSyncResult((prev) => ({
        ...prev,
        [integrationId]: { ok: false, msg: (err as Error).message },
      }));
    }
    setSyncing(null);
  };

  const testConnection = async (integrationId: string) => {
    setTesting(integrationId);
    setTestResult((prev) => ({ ...prev, [integrationId]: undefined as unknown as { success: boolean; message: string; latencyMs: number } }));
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", integration: integrationId }),
      });
      const result = await res.json();
      setTestResult((prev) => ({ ...prev, [integrationId]: result }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [integrationId]: { success: false, message: (err as Error).message, latencyMs: 0 },
      }));
    }
    setTesting(null);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Link2 className="w-6 h-6 text-blue-400" /> Integrations
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {data.configured}/{data.total} connected
            </p>
          </div>
          <button onClick={load} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {data.integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              syncing={syncing === integration.id}
              syncResult={syncResult[integration.id]}
              onSync={() => triggerSync(integration.id)}
              testingConnection={testing === integration.id}
              testConnectionResult={testResult[integration.id]}
              onTestConnection={() => testConnection(integration.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────

function IntegrationCard({
  integration,
  syncing,
  syncResult,
  onSync,
  testingConnection,
  testConnectionResult,
  onTestConnection,
}: {
  integration: IntegrationStatus;
  syncing: boolean;
  syncResult?: { ok: boolean; msg: string };
  onSync: () => void;
  testingConnection: boolean;
  testConnectionResult?: { success: boolean; message: string; latencyMs: number };
  onTestConnection: () => void;
}) {
  const icon = ICONS[integration.id] || <Zap className="w-5 h-5" />;
  const description = DESCRIPTIONS[integration.id] || "";
  const hasSyncAction = integration.actions.includes("sync-all");

  return (
    <div className={cn(
      "bg-zinc-900/50 border rounded-xl p-5 transition-colors",
      integration.configured ? "border-green-800/30" : "border-zinc-800",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            integration.configured ? "bg-green-900/30 text-green-400" : "bg-zinc-800 text-zinc-500",
          )}>
            {icon}
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              {integration.name}
              {integration.configured ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 font-medium">Connected</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 font-medium">Not configured</span>
              )}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {integration.configured && (
            <button
              onClick={onTestConnection}
              disabled={testingConnection}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
            >
              {testingConnection ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Test
            </button>
          )}
          {hasSyncAction && integration.configured && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync Now
            </button>
          )}
        </div>
      </div>

      {/* Env vars */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Configuration</p>
        <div className="flex flex-wrap gap-2">
          {integration.envVars.map((env) => (
            <div key={env.name} className="flex items-center gap-1 text-xs">
              {env.set ? (
                <CheckCircle2 className="w-3 h-3 text-green-400" />
              ) : (
                <XCircle className="w-3 h-3 text-zinc-600" />
              )}
              <code className={cn("font-mono text-[11px]", env.set ? "text-zinc-300" : "text-zinc-600")}>
                {env.name}
              </code>
              {env.required && !env.set && (
                <span className="text-[9px] text-red-400">(required)</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      {integration.configured && Object.keys(integration.summary).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-2">
          {Object.entries(integration.summary).map(([key, val]) => (
            <div key={key} className="text-xs">
              <span className="text-zinc-500">{key.replace(/([A-Z])/g, " $1").toLowerCase()}: </span>
              <span className="text-zinc-300 font-mono">{String(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sync result */}
      {syncResult && (
        <div className={cn(
          "flex items-center gap-2 text-xs mt-2 p-2 rounded-lg",
          syncResult.ok ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400",
        )}>
          {syncResult.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {syncResult.msg}
        </div>
      )}

      {/* Test connection result */}
      {testConnectionResult && (
        <div className={cn(
          "flex items-center gap-2 text-xs mt-2 p-2 rounded-lg",
          testConnectionResult.success ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400",
        )}>
          {testConnectionResult.success ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {testConnectionResult.message}
          {testConnectionResult.latencyMs > 0 && (
            <span className="text-zinc-500 ml-auto">{testConnectionResult.latencyMs}ms</span>
          )}
        </div>
      )}

      {/* Setup hint for unconfigured */}
      {!integration.configured && (
        <div className="mt-3 p-3 bg-zinc-800/50 rounded-lg">
          <p className="text-xs text-zinc-400">
            Set the required environment variable{integration.envVars.filter((e) => e.required).length > 1 ? "s" : ""} in{" "}
            <code className="bg-zinc-900 px-1 rounded text-[11px]">.env.local</code> to enable this integration.
          </p>
        </div>
      )}
    </div>
  );
}
