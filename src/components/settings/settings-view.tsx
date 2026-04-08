"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings, FolderOpen, Eye, EyeOff, RefreshCw,
  HardDrive, FileCode, ShieldCheck, Lock,
  Sparkles, Check, AlertCircle, Loader2, PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/hooks/use-preferences";
import { useHubConfig } from "@/components/providers/hub-provider";

interface DirectoryInfo {
  name: string;
  workspace: string;
  status: "active" | "config-skip" | "pref-skip";
  artifactCount: number;
}

interface SettingsData {
  workspaces: { path: string; label: string }[];
  scanner: {
    extensions: string[];
    skipDirs: string[];
    skipPaths: string[];
  };
  directories: DirectoryInfo[];
  preferences: {
    hygieneExclude?: string[];
    scannerExclude?: string[];
  };
  artifactCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Scanned",
  "config-skip": "Skipped (config)",
  "pref-skip": "Skipped (UI)",
};

interface AiProviderState {
  anthropicKey: string;
  openaiKey: string;
  ollamaUrl: string;
  defaultProvider: string;
  testing: string | null;
  testResult: Record<string, "ok" | "error" | null>;
  savingAi: boolean;
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? "****" : "";
  return key.slice(0, 5) + "..." + key.slice(-4);
}

const FEATURE_ITEMS = [
  { id: "briefing", label: "Briefing" },
  { id: "repos", label: "Repos" },
  { id: "hygiene", label: "Hygiene" },
  { id: "ask", label: "Ask AI" },
  { id: "decisions", label: "Decisions" },
  { id: "notifications", label: "Inbox" },
];

export function SettingsView() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { preferences, mutate: mutatePrefs } = usePreferences();
  const config = useHubConfig();

  const [ai, setAi] = useState<AiProviderState>({
    anthropicKey: "",
    openaiKey: "",
    ollamaUrl: "http://localhost:11434",
    defaultProvider: "",
    testing: null,
    testResult: {},
    savingAi: false,
  });
  const [aiLoaded, setAiLoaded] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load AI preferences
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((prefs) => {
        setAi((prev) => ({
          ...prev,
          anthropicKey: prefs.anthropicApiKey || "",
          openaiKey: prefs.openaiApiKey || "",
          ollamaUrl: prefs.ollamaUrl || "http://localhost:11434",
          defaultProvider: prefs.aiProvider || "",
        }));
        setAiLoaded(true);
      })
      .catch(() => setAiLoaded(true));
  }, []);

  const saveAiSettings = useCallback(async () => {
    setAi((prev) => ({ ...prev, savingAi: true }));
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiProvider: ai.defaultProvider || undefined,
        anthropicApiKey: ai.anthropicKey || undefined,
        openaiApiKey: ai.openaiKey || undefined,
        ollamaUrl: ai.ollamaUrl !== "http://localhost:11434" ? ai.ollamaUrl : undefined,
      }),
    });
    setAi((prev) => ({ ...prev, savingAi: false }));
  }, [ai.defaultProvider, ai.anthropicKey, ai.openaiKey, ai.ollamaUrl]);

  const testProvider = useCallback(async (provider: string) => {
    setAi((prev) => ({ ...prev, testing: provider, testResult: { ...prev.testResult, [provider]: null } }));
    try {
      const res = await fetch(`/api/ai/models?health=true&provider=${provider}`);
      const data = await res.json();
      const ok = data.providers?.find((p: { name: string }) => p.name === provider)?.health?.ok;
      setAi((prev) => ({ ...prev, testing: null, testResult: { ...prev.testResult, [provider]: ok ? "ok" : "error" } }));
    } catch {
      setAi((prev) => ({ ...prev, testing: null, testResult: { ...prev.testResult, [provider]: "error" } }));
    }
  }, []);

  const toggleScannerDir = useCallback(async (dirName: string) => {
    if (!data) return;
    setSaving(true);

    const currentExclude = data.preferences.scannerExclude || [];
    const isExcluded = currentExclude.includes(dirName);
    const next = isExcluded
      ? currentExclude.filter((d) => d !== dirName)
      : [...currentExclude, dirName];

    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scannerExclude: next }),
    });

    setRegenerating(true);
    await fetch("/api/regenerate", { method: "POST" });
    setRegenerating(false);
    setSaving(false);
    load();
  }, [data, load]);

  const toggleHygieneDir = useCallback(async (dirName: string) => {
    if (!data) return;
    setSaving(true);

    const currentExclude = data.preferences.hygieneExclude || [];
    const isExcluded = currentExclude.includes(dirName);
    const next = isExcluded
      ? currentExclude.filter((d) => d !== dirName)
      : [...currentExclude, dirName];

    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hygieneExclude: next }),
    });

    setSaving(false);
    load();
  }, [data, load]);

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings size={20} className="text-accent" />
          <h1 className="text-lg font-semibold text-text">Settings</h1>
        </div>
        <div className="text-[13px] text-text-dim animate-pulse">Loading settings...</div>
      </div>
    );
  }

  if (!data) return null;

  const activeCount = data.directories.filter((d) => d.status === "active").length;
  const skippedCount = data.directories.filter((d) => d.status !== "active").length;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text">Settings</h1>
        <span className="text-[11px] text-text-dim ml-auto">
          {data.artifactCount} artifacts across {data.workspaces.length} workspace(s)
        </span>
      </div>

      {/* Sidebar visibility */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text-muted mb-1 flex items-center gap-2">
          <PanelLeft size={14} />
          Sidebar
        </h2>
        <p className="text-[11px] text-text-dim mb-3">
          Toggle which tabs and features appear in the sidebar. Hidden items are still accessible via URL.
        </p>
        <div className="space-y-1">
          {[
            ...config.tabs.map((t) => ({ id: t.id, label: t.label, section: "Tab" })),
            ...FEATURE_ITEMS.map((f) => ({ ...f, section: "Feature" })),
          ].map((item) => {
            const isHidden = (preferences.hiddenSidebarItems || []).includes(item.id);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2 bg-surface border border-border rounded-md"
              >
                <button
                  onClick={() => {
                    const current = preferences.hiddenSidebarItems || [];
                    const next = isHidden
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id];
                    mutatePrefs({ hiddenSidebarItems: next });
                  }}
                  className="shrink-0 hover:text-accent transition-colors"
                  title={isHidden ? "Show in sidebar" : "Hide from sidebar"}
                >
                  {isHidden ? (
                    <EyeOff size={14} className="text-orange-400" />
                  ) : (
                    <Eye size={14} className="text-accent" />
                  )}
                </button>
                <span className="text-[13px] text-text flex-1">{item.label}</span>
                <span className="text-[9px] text-text-dim">{item.section}</span>
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold",
                  isHidden ? "bg-orange-900/20 text-orange-400" : "bg-accent/10 text-accent",
                )}>
                  {isHidden ? "Hidden" : "Visible"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI Providers */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text-muted mb-3 flex items-center gap-2">
          <Sparkles size={14} />
          AI Providers
        </h2>
        <p className="text-[11px] text-text-dim mb-3">
          Configure AI providers for insights, hygiene analysis, and search. Environment variables override these settings.
        </p>
        <div className="space-y-3">
          {/* Anthropic */}
          <div className="bg-surface border border-border rounded-md px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-text">Anthropic (Claude)</span>
              {ai.testResult.anthropic === "ok" && <Check size={14} className="text-green-400" />}
              {ai.testResult.anthropic === "error" && <AlertCircle size={14} className="text-red-400" />}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="sk-ant-..."
                value={ai.anthropicKey}
                onChange={(e) => setAi((prev) => ({ ...prev, anthropicKey: e.target.value }))}
                className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-[12px] text-text font-mono placeholder:text-text-dim focus:border-accent outline-none"
              />
              <button
                onClick={() => testProvider("anthropic")}
                disabled={!ai.anthropicKey || ai.testing === "anthropic"}
                className="px-3 py-1.5 text-[11px] bg-surface-hover border border-border rounded text-text-muted hover:text-accent disabled:opacity-40 transition-colors"
              >
                {ai.testing === "anthropic" ? <Loader2 size={12} className="animate-spin" /> : "Test"}
              </button>
            </div>
          </div>

          {/* OpenAI */}
          <div className="bg-surface border border-border rounded-md px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-text">OpenAI (GPT)</span>
              {ai.testResult.openai === "ok" && <Check size={14} className="text-green-400" />}
              {ai.testResult.openai === "error" && <AlertCircle size={14} className="text-red-400" />}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="sk-..."
                value={ai.openaiKey}
                onChange={(e) => setAi((prev) => ({ ...prev, openaiKey: e.target.value }))}
                className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-[12px] text-text font-mono placeholder:text-text-dim focus:border-accent outline-none"
              />
              <button
                onClick={() => testProvider("openai")}
                disabled={!ai.openaiKey || ai.testing === "openai"}
                className="px-3 py-1.5 text-[11px] bg-surface-hover border border-border rounded text-text-muted hover:text-accent disabled:opacity-40 transition-colors"
              >
                {ai.testing === "openai" ? <Loader2 size={12} className="animate-spin" /> : "Test"}
              </button>
            </div>
          </div>

          {/* Ollama */}
          <div className="bg-surface border border-border rounded-md px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-medium text-text">Ollama (Local)</span>
              {ai.testResult.ollama === "ok" && <Check size={14} className="text-green-400" />}
              {ai.testResult.ollama === "error" && <AlertCircle size={14} className="text-red-400" />}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="http://localhost:11434"
                value={ai.ollamaUrl}
                onChange={(e) => setAi((prev) => ({ ...prev, ollamaUrl: e.target.value }))}
                className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-[12px] text-text font-mono placeholder:text-text-dim focus:border-accent outline-none"
              />
              <button
                onClick={() => testProvider("ollama")}
                disabled={ai.testing === "ollama"}
                className="px-3 py-1.5 text-[11px] bg-surface-hover border border-border rounded text-text-muted hover:text-accent disabled:opacity-40 transition-colors"
              >
                {ai.testing === "ollama" ? <Loader2 size={12} className="animate-spin" /> : "Test"}
              </button>
            </div>
            <p className="text-[10px] text-text-dim mt-1.5">Free, runs locally. Install from ollama.com</p>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={saveAiSettings}
          disabled={ai.savingAi}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/30 rounded-md text-[13px] text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {ai.savingAi ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save AI Settings
        </button>
      </section>

      {/* Workspaces */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text-muted mb-3 flex items-center gap-2">
          <HardDrive size={14} />
          Workspaces
        </h2>
        <div className="space-y-2">
          {data.workspaces.map((ws) => (
            <div key={ws.path} className="flex items-center gap-3 bg-surface border border-border rounded-md px-4 py-2.5">
              <FolderOpen size={14} className="text-accent shrink-0" />
              <span className="text-[13px] font-medium text-text">{ws.label}</span>
              <span className="text-[11px] text-text-dim font-mono truncate">{ws.path}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Directory toggles */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text-muted mb-1 flex items-center gap-2">
          <FolderOpen size={14} />
          Directories
        </h2>
        <p className="text-[11px] text-text-dim mb-3">
          Toggle directories on/off for scanning. {activeCount} active, {skippedCount} skipped.
          {regenerating && <span className="text-accent ml-2">Rescanning...</span>}
        </p>
        <div className="space-y-1">
          {data.directories.map((dir) => {
            const isActive = dir.status === "active";
            const isConfigSkip = dir.status === "config-skip";
            const isPrefSkip = dir.status === "pref-skip";

            return (
              <div
                key={`${dir.workspace}-${dir.name}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-md border transition-colors",
                  isActive ? "bg-surface border-border" : "bg-surface-hover border-border opacity-60",
                )}
              >
                <button
                  onClick={() => !isConfigSkip && toggleScannerDir(dir.name)}
                  disabled={isConfigSkip || saving}
                  className={cn(
                    "shrink-0 transition-colors",
                    isConfigSkip ? "text-text-dim cursor-not-allowed" : "hover:text-accent",
                  )}
                  title={isConfigSkip ? "Skipped in hub.config.ts (edit config to change)" : isActive ? "Click to exclude" : "Click to include"}
                >
                  {isActive ? (
                    <Eye size={14} className="text-accent" />
                  ) : (
                    <EyeOff size={14} className="text-text-dim" />
                  )}
                </button>

                <span className="text-[13px] font-medium text-text flex-1">{dir.name}</span>
                <span className="text-[10px] text-text-dim">{dir.workspace}</span>

                {dir.artifactCount > 0 && (
                  <span className="text-[10px] text-text-dim tabular-nums">{dir.artifactCount} artifacts</span>
                )}

                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold",
                  isActive && "bg-accent/10 text-accent",
                  isPrefSkip && "bg-orange/10 text-orange",
                  isConfigSkip && "bg-surface-hover text-text-dim",
                )}>
                  {STATUS_LABELS[dir.status]}
                </span>

                {isConfigSkip && <span title="Locked in config"><Lock size={10} className="text-text-dim" /></span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Hygiene scope */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text-muted mb-1 flex items-center gap-2">
          <ShieldCheck size={14} />
          Hygiene Analysis Scope
        </h2>
        <p className="text-[11px] text-text-dim mb-3">
          Exclude directories from document hygiene analysis (duplicate detection, staleness).
        </p>
        <div className="space-y-1">
          {data.directories.filter((d) => d.status === "active").map((dir) => {
            const excluded = (data.preferences.hygieneExclude || []).includes(dir.name);
            return (
              <div
                key={`hygiene-${dir.name}`}
                className="flex items-center gap-3 px-4 py-2 bg-surface border border-border rounded-md"
              >
                <button
                  onClick={() => toggleHygieneDir(dir.name)}
                  disabled={saving}
                  className="shrink-0 hover:text-accent transition-colors"
                  title={excluded ? "Include in hygiene" : "Exclude from hygiene"}
                >
                  {excluded ? (
                    <EyeOff size={14} className="text-orange" />
                  ) : (
                    <ShieldCheck size={14} className="text-accent" />
                  )}
                </button>
                <span className="text-[13px] text-text flex-1">{dir.name}</span>
                <span className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold",
                  excluded ? "bg-orange/10 text-orange" : "bg-accent/10 text-accent",
                )}>
                  {excluded ? "Excluded" : "Included"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* File types */}
      <section className="mb-8">
        <h2 className="text-[14px] font-semibold text-text-muted mb-3 flex items-center gap-2">
          <FileCode size={14} />
          Tracked File Types
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {data.scanner.extensions.map((ext) => (
            <span key={ext} className="text-[11px] px-2.5 py-1 bg-surface border border-border rounded-full text-text-muted font-mono">
              {ext}
            </span>
          ))}
        </div>
      </section>

      {/* Rescan */}
      <section>
        <button
          onClick={async () => {
            setRegenerating(true);
            await fetch("/api/regenerate", { method: "POST" });
            setRegenerating(false);
            load();
          }}
          disabled={regenerating}
          className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-md text-[13px] text-text-muted hover:text-accent hover:border-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
          {regenerating ? "Rescanning..." : "Rescan workspace"}
        </button>
      </section>
    </div>
  );
}
