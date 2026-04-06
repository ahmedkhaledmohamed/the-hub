/**
 * HTTP client for The Hub API.
 * Fetches workspace data from the running Hub server.
 */

import * as vscode from "vscode";

function getBaseUrl(): string {
  return vscode.workspace.getConfiguration("theHub").get<string>("serverUrl") || "http://localhost:9002";
}

async function fetchJson<T>(path: string): Promise<T | null> {
  const url = `${getBaseUrl()}${path}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────

export interface HygieneReport {
  findings: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    suggestion: string;
    similarity?: number;
    artifacts: Array<{ path: string; title: string }>;
  }>;
  stats: {
    filesAnalyzed: number;
    totalFindings: number;
  };
}

export interface Decision {
  summary: string;
  status: string;
  artifactPath: string;
  actor?: string;
  decidedAt?: string;
}

export interface DecisionResponse {
  decisions: Decision[];
  counts: { active: number; superseded: number; reverted: number };
}

export interface ManifestResponse {
  generatedAt: string;
  artifactCount: number;
  groupCount: number;
  groups: Array<{ id: string; label: string; count: number }>;
  artifacts: Array<{
    path: string;
    title: string;
    type: string;
    group: string;
    staleDays: number;
  }>;
}

export interface BriefingResponse {
  recentChanges: Array<{ path: string; title: string; staleDays: number }>;
  staleCount: number;
  totalArtifacts: number;
}

// ── API calls ─────────────────────────────────────────────────────

export async function fetchHygiene(): Promise<HygieneReport | null> {
  return fetchJson<HygieneReport>("/api/hygiene");
}

export async function fetchDecisions(): Promise<DecisionResponse | null> {
  return fetchJson<DecisionResponse>("/api/decisions");
}

export async function fetchManifest(): Promise<ManifestResponse | null> {
  return fetchJson<ManifestResponse>("/api/manifest?format=summary");
}

export async function fetchSearch(query: string): Promise<Array<{ title: string; path: string; snippet: string }> | null> {
  return fetchJson(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
}

export async function isServerReachable(): Promise<boolean> {
  const result = await fetchJson<{ artifactCount?: number }>("/api/status");
  return result !== null;
}
