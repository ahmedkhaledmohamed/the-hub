/**
 * The Hub VS Code Extension
 *
 * Provides a sidebar with workspace intelligence from The Hub:
 * - Workspace health (freshness, staleness, quality score)
 * - Hygiene issues (duplicates, stale docs, similar titles)
 * - Active decisions (tracked from documents)
 * - Recently changed docs
 * - Cross-workspace search
 * - Status bar with quality score
 *
 * This extension complements Cursor/VS Code — it does NOT duplicate:
 * - File search (Cmd+P exists)
 * - Git integration (built-in)
 * - AI chat (Claude/GPT built-in)
 * - MCP tools (consumed natively)
 * - Code intelligence (LSP)
 */

import * as vscode from "vscode";
import { HealthProvider, HygieneProvider, DecisionsProvider, RecentProvider } from "./tree-providers";
import { isServerReachable, fetchManifest, fetchSearch } from "./hub-client";

let statusBarItem: vscode.StatusBarItem;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // ── Tree views ────────────────────────────────────────────────
  const healthProvider = new HealthProvider();
  const hygieneProvider = new HygieneProvider();
  const decisionsProvider = new DecisionsProvider();
  const recentProvider = new RecentProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("hub-health", healthProvider),
    vscode.window.registerTreeDataProvider("hub-hygiene", hygieneProvider),
    vscode.window.registerTreeDataProvider("hub-decisions", decisionsProvider),
    vscode.window.registerTreeDataProvider("hub-recent", recentProvider),
  );

  // ── Status bar ────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  statusBarItem.command = "theHub.refresh";
  statusBarItem.tooltip = "The Hub — click to refresh";
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  // ── Commands ──────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("theHub.refresh", async () => {
      await Promise.all([
        healthProvider.load(),
        hygieneProvider.load(),
        decisionsProvider.load(),
        recentProvider.load(),
      ]);
      await updateStatusBar();
      vscode.window.showInformationMessage("The Hub: Refreshed");
    }),

    vscode.commands.registerCommand("theHub.openInBrowser", () => {
      const url = vscode.workspace.getConfiguration("theHub").get<string>("serverUrl") || "http://localhost:9002";
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand("theHub.searchWorkspace", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Search across all Hub workspaces",
        placeHolder: "Enter search query...",
      });
      if (!query) return;

      const results = await fetchSearch(query);
      if (!results || results.length === 0) {
        vscode.window.showInformationMessage(`No results for "${query}"`);
        return;
      }

      const items = results.map((r) => ({
        label: r.title,
        description: r.path,
        detail: r.snippet?.replace(/<\/?mark>/g, ""),
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `${results.length} results for "${query}"`,
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        // Try to open the file
        const url = vscode.workspace.getConfiguration("theHub").get<string>("serverUrl") || "http://localhost:9002";
        vscode.env.openExternal(vscode.Uri.parse(`${url}/api/file/${selected.description}`));
      }
    }),
  );

  // ── Auto-refresh ──────────────────────────────────────────────
  const interval = vscode.workspace.getConfiguration("theHub").get<number>("refreshInterval") || 60;
  if (interval > 0) {
    refreshTimer = setInterval(async () => {
      await Promise.all([
        healthProvider.load(),
        hygieneProvider.load(),
        decisionsProvider.load(),
        recentProvider.load(),
      ]);
      await updateStatusBar();
    }, interval * 1000);

    context.subscriptions.push({ dispose: () => { if (refreshTimer) clearInterval(refreshTimer); } });
  }

  // Initial load
  void Promise.all([
    healthProvider.load(),
    hygieneProvider.load(),
    decisionsProvider.load(),
    recentProvider.load(),
  ]);
}

async function updateStatusBar(): Promise<void> {
  const reachable = await isServerReachable();
  if (!reachable) {
    statusBarItem.text = "$(database) Hub: offline";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
    return;
  }

  const manifest = await fetchManifest();
  if (!manifest) {
    statusBarItem.text = "$(database) Hub";
    statusBarItem.show();
    return;
  }

  const total = manifest.artifactCount;
  const stale = manifest.artifacts?.filter((a) => a.staleDays > 90).length || 0;
  const fresh = manifest.artifacts?.filter((a) => a.staleDays <= 7).length || 0;
  const freshPct = total > 0 ? Math.round((fresh / total) * 100) : 0;

  const icon = freshPct > 70 ? "$(check)" : freshPct > 40 ? "$(warning)" : "$(error)";
  statusBarItem.text = `${icon} Hub: ${total} docs, ${freshPct}% fresh${stale > 0 ? `, ${stale} stale` : ""}`;
  statusBarItem.show();
}

export function deactivate(): void {
  if (refreshTimer) clearInterval(refreshTimer);
}
