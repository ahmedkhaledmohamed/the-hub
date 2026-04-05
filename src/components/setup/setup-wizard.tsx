"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2, FolderOpen, Brain, Search,
  ArrowRight, RefreshCw, Zap, AlertTriangle, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface WorkspaceInfo {
  path: string;
  label: string;
  exists: boolean;
  fileCount: number;
}

interface FeatureInfo {
  name: string;
  available: boolean;
  reason: string;
}

interface SetupStatus {
  config: {
    exists: boolean;
    workspaceCount: number;
    workspaces: WorkspaceInfo[];
  };
  ai: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    ollamaDetected: boolean;
  };
  features: FeatureInfo[];
  scan: {
    lastScan: string | null;
    artifactCount: number;
  };
  overall: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
  };
}

type Step = "config" | "ai" | "scan" | "done";

// ── Component ─────────────────────────────────────────────────────

export function SetupWizard() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>("config");
  const [scanning, setScanning] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; model?: string; error?: string } | null>(null);
  const [scanResult, setScanResult] = useState<{ success: boolean; artifactCount?: number; error?: string } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup");
      const data = await res.json();
      setStatus(data);

      // Auto-advance to appropriate step
      if (!data.config.exists || data.config.workspaces.every((w: WorkspaceInfo) => !w.exists)) {
        setCurrentStep("config");
      } else if (!data.ai.configured && !data.ai.ollamaDetected) {
        setCurrentStep("ai");
      } else if (data.scan.artifactCount === 0) {
        setCurrentStep("scan");
      } else {
        setCurrentStep("done");
      }
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const testAI = async () => {
    setTestingAI(true);
    setAiTestResult(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-ai" }),
      });
      const data = await res.json();
      setAiTestResult(data);
      if (data.success) await loadStatus();
    } catch (err) {
      setAiTestResult({ success: false, error: "Network error" });
    }
    setTestingAI(false);
  };

  const triggerScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/regenerate", { method: "POST" });
      const data = await res.json();
      setScanResult({ success: true, artifactCount: data.artifactCount });
      await loadStatus();
    } catch (err) {
      setScanResult({ success: false, error: "Scan failed — check server logs" });
    }
    setScanning(false);
  };

  if (loading || !status) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const steps: { id: Step; label: string; done: boolean }[] = [
    { id: "config", label: "Workspaces", done: status.config.exists && status.config.workspaces.some((w) => w.exists) },
    { id: "ai", label: "AI Provider", done: status.ai.configured || status.ai.ollamaDetected },
    { id: "scan", label: "First Scan", done: status.scan.artifactCount > 0 },
    { id: "done", label: "Ready", done: status.overall.ready && status.scan.artifactCount > 0 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Set up The Hub</h1>
          <p className="text-zinc-400">
            {status.overall.ready && status.scan.artifactCount > 0
              ? "Your Hub is configured and ready."
              : "Let's get your workspace indexed and ready for AI."
            }
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                  currentStep === step.id
                    ? "bg-blue-600 text-white"
                    : step.done
                      ? "bg-green-900/40 text-green-400"
                      : "bg-zinc-800 text-zinc-500",
                )}
              >
                {step.done ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-4 h-4 inline-flex items-center justify-center text-xs">{i + 1}</span>}
                {step.label}
              </button>
              {i < steps.length - 1 && <ArrowRight className="w-4 h-4 text-zinc-600" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="space-y-6">
          {currentStep === "config" && (
            <ConfigStep
              status={status}
              onNext={() => setCurrentStep("ai")}
            />
          )}
          {currentStep === "ai" && (
            <AIStep
              status={status}
              testing={testingAI}
              testResult={aiTestResult}
              onTest={testAI}
              onNext={() => setCurrentStep("scan")}
              onSkip={() => setCurrentStep("scan")}
            />
          )}
          {currentStep === "scan" && (
            <ScanStep
              status={status}
              scanning={scanning}
              scanResult={scanResult}
              onScan={triggerScan}
              onNext={() => setCurrentStep("done")}
            />
          )}
          {currentStep === "done" && (
            <DoneStep status={status} onRefresh={loadStatus} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step: Config ──────────────────────────────────────────────────

function ConfigStep({ status, onNext }: { status: SetupStatus; onNext: () => void }) {
  const hasValidWorkspaces = status.config.workspaces.some((w) => w.exists);

  return (
    <div className="space-y-6">
      <SectionCard title="Workspace Configuration" icon={<FolderOpen className="w-5 h-5" />}>
        {status.config.workspaces.length === 0 ? (
          <div className="p-4 bg-yellow-900/20 border border-yellow-800/40 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-yellow-200 font-medium">No workspaces configured</p>
                <p className="text-yellow-200/60 text-sm mt-1">
                  Copy <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">hub.config.example.ts</code> to <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">hub.config.ts</code> and add your workspace paths.
                </p>
                <pre className="mt-3 bg-zinc-900 p-3 rounded text-xs text-zinc-300 overflow-x-auto">
{`cp hub.config.example.ts hub.config.ts
# Edit hub.config.ts — add your workspace paths`}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {status.config.workspaces.map((ws) => (
              <div
                key={ws.path}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border",
                  ws.exists
                    ? "bg-green-900/10 border-green-800/30"
                    : "bg-red-900/10 border-red-800/30",
                )}
              >
                <div className="flex items-center gap-3">
                  {ws.exists ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{ws.label || ws.path}</p>
                    <p className="text-xs text-zinc-500">{ws.path}</p>
                  </div>
                </div>
                <span className="text-xs text-zinc-500">
                  {ws.exists ? `${ws.fileCount} items` : "Not found"}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {hasValidWorkspaces && (
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          Next: Configure AI <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Step: AI ──────────────────────────────────────────────────────

function AIStep({
  status, testing, testResult, onTest, onNext, onSkip,
}: {
  status: SetupStatus;
  testing: boolean;
  testResult: { success: boolean; model?: string; error?: string } | null;
  onTest: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-6">
      <SectionCard title="AI Provider" icon={<Brain className="w-5 h-5" />}>
        {status.ai.configured ? (
          <div className="p-4 bg-green-900/20 border border-green-800/30 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-green-200 font-medium">AI configured: {status.ai.provider}</p>
                <p className="text-green-200/60 text-sm">Model: {status.ai.model}</p>
              </div>
            </div>
          </div>
        ) : status.ai.ollamaDetected ? (
          <div className="p-4 bg-blue-900/20 border border-blue-800/30 rounded-lg">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-blue-200 font-medium">Ollama detected locally</p>
                <p className="text-blue-200/60 text-sm">Auto-configured — no API key needed</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              AI powers RAG Q&A, summarization, smart triage, and content generation. Choose one:
            </p>
            <div className="grid grid-cols-1 gap-3">
              <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                <p className="font-medium text-sm mb-1">Option 1: Ollama (local, free)</p>
                <p className="text-xs text-zinc-400 mb-2">Install Ollama and pull a model. The Hub auto-detects it.</p>
                <pre className="bg-zinc-900 p-2 rounded text-xs text-zinc-300">
{`curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3`}
                </pre>
              </div>
              <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                <p className="font-medium text-sm mb-1">Option 2: Cloud API (OpenAI, Anthropic)</p>
                <p className="text-xs text-zinc-400 mb-2">Set environment variables in <code className="bg-zinc-900 px-1 rounded">.env.local</code>:</p>
                <pre className="bg-zinc-900 p-2 rounded text-xs text-zinc-300">
{`AI_GATEWAY_URL=https://api.openai.com/v1/chat/completions
AI_GATEWAY_KEY=sk-...
AI_MODEL=gpt-4o-mini`}
                </pre>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onTest}
            disabled={testing}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Test AI Connection
          </button>
          {testResult && (
            <span className={cn("text-sm", testResult.success ? "text-green-400" : "text-red-400")}>
              {testResult.success ? `Connected (${testResult.model})` : testResult.error}
            </span>
          )}
        </div>
      </SectionCard>

      <div className="flex items-center gap-3">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          Next: Scan Workspace <ArrowRight className="w-4 h-4" />
        </button>
        {!status.ai.configured && !status.ai.ollamaDetected && (
          <button
            onClick={onSkip}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Skip — use without AI
          </button>
        )}
      </div>
    </div>
  );
}

// ── Step: Scan ────────────────────────────────────────────────────

function ScanStep({
  status, scanning, scanResult, onScan, onNext,
}: {
  status: SetupStatus;
  scanning: boolean;
  scanResult: { success: boolean; artifactCount?: number; error?: string } | null;
  onScan: () => void;
  onNext: () => void;
}) {
  const alreadyScanned = status.scan.artifactCount > 0;

  return (
    <div className="space-y-6">
      <SectionCard title="Workspace Scan" icon={<Search className="w-5 h-5" />}>
        {alreadyScanned ? (
          <div className="p-4 bg-green-900/20 border border-green-800/30 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-green-200 font-medium">{status.scan.artifactCount} artifacts indexed</p>
                <p className="text-green-200/60 text-sm">Your workspace is searchable</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            Scan your configured workspaces to index all documents. This creates the searchable database.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {alreadyScanned ? "Rescan" : "Run First Scan"}
          </button>
          {scanResult && (
            <span className={cn("text-sm", scanResult.success ? "text-green-400" : "text-red-400")}>
              {scanResult.success ? `Found ${scanResult.artifactCount} artifacts` : scanResult.error}
            </span>
          )}
        </div>
      </SectionCard>

      {(alreadyScanned || scanResult?.success) && (
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          Finish Setup <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Step: Done ────────────────────────────────────────────────────

function DoneStep({ status, onRefresh }: { status: SetupStatus; onRefresh: () => void }) {
  const available = status.features.filter((f) => f.available);
  const unavailable = status.features.filter((f) => !f.available);

  return (
    <div className="space-y-6">
      <div className="p-6 bg-green-900/20 border border-green-800/30 rounded-xl text-center">
        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-green-200 mb-1">Your Hub is ready</h2>
        <p className="text-green-200/60 text-sm">
          {status.scan.artifactCount} artifacts indexed across {status.config.workspaces.filter((w) => w.exists).length} workspace{status.config.workspaces.filter((w) => w.exists).length !== 1 ? "s" : ""}
        </p>
      </div>

      <SectionCard title={`Available Features (${available.length}/${status.features.length})`} icon={<Zap className="w-5 h-5" />}>
        <div className="space-y-1.5">
          {available.map((f) => (
            <div key={f.name} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span>{f.name}</span>
              <span className="text-xs text-zinc-600 ml-auto">{f.reason}</span>
            </div>
          ))}
        </div>
        {unavailable.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-1.5">
            <p className="text-xs text-zinc-500 font-medium mb-2">Not configured:</p>
            {unavailable.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-sm text-zinc-500">
                <XCircle className="w-4 h-4 text-zinc-600 shrink-0" />
                <span>{f.name}</span>
                <span className="text-xs text-zinc-700 ml-auto">{f.reason}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="flex items-center gap-3">
        <a
          href="/briefing"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          Go to Briefing <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-400 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh Status
        </button>
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-400">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
