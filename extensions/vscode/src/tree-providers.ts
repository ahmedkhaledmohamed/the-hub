/**
 * Tree data providers for The Hub sidebar views.
 * Each provider fetches data from The Hub API and displays it in a tree view.
 */

import * as vscode from "vscode";
import { fetchHygiene, fetchDecisions, fetchManifest, type HygieneReport, type Decision, type ManifestResponse } from "./hub-client";

// ── Base tree item ────────────────────────────────────────────────

class HubTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    description?: string,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    icon?: string,
  ) {
    super(label, collapsibleState);
    this.description = description;
    if (icon) this.iconPath = new vscode.ThemeIcon(icon);
  }
}

// ── Health provider ───────────────────────────────────────────────

export class HealthProvider implements vscode.TreeDataProvider<HubTreeItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private data: ManifestResponse | null = null;
  private hygieneData: HygieneReport | null = null;

  refresh(): void { this._onDidChange.fire(); }

  async load(): Promise<void> {
    this.data = await fetchManifest();
    this.hygieneData = await fetchHygiene();
    this.refresh();
  }

  getTreeItem(element: HubTreeItem): HubTreeItem { return element; }

  async getChildren(): Promise<HubTreeItem[]> {
    if (!this.data) {
      await this.load();
      if (!this.data) return [new HubTreeItem("Hub not reachable", "Check server", undefined, "warning")];
    }

    const items: HubTreeItem[] = [];

    // Quality metrics
    const total = this.data.artifactCount;
    const stale = this.data.artifacts?.filter((a) => a.staleDays > 90).length || 0;
    const fresh = this.data.artifacts?.filter((a) => a.staleDays <= 7).length || 0;
    const freshPct = total > 0 ? Math.round((fresh / total) * 100) : 0;

    items.push(new HubTreeItem(`${total} artifacts`, `${this.data.groupCount} groups`, undefined, "folder-library"));
    items.push(new HubTreeItem(`${freshPct}% fresh`, `${fresh} updated in 7d`, undefined, freshPct > 70 ? "pass" : freshPct > 40 ? "warning" : "error"));
    if (stale > 0) items.push(new HubTreeItem(`${stale} stale`, ">90 days old", undefined, "clock"));

    // Hygiene
    if (this.hygieneData && this.hygieneData.stats.totalFindings > 0) {
      const h = this.hygieneData;
      const high = h.findings.filter((f) => f.severity === "high").length;
      const med = h.findings.filter((f) => f.severity === "medium").length;
      const icon = high > 0 ? "error" : med > 0 ? "warning" : "info";
      items.push(new HubTreeItem(`${h.stats.totalFindings} hygiene issues`, `${high} high, ${med} medium`, undefined, icon));
    } else {
      items.push(new HubTreeItem("No hygiene issues", "Clean", undefined, "check"));
    }

    // Groups
    if (this.data.groups) {
      for (const g of this.data.groups.slice(0, 5)) {
        items.push(new HubTreeItem(g.label, `${g.count} artifacts`, undefined, "symbol-folder"));
      }
    }

    items.push(new HubTreeItem(`Last scan: ${new Date(this.data.generatedAt).toLocaleTimeString()}`, undefined, undefined, "history"));

    return items;
  }
}

// ── Hygiene provider ──────────────────────────────────────────────

export class HygieneProvider implements vscode.TreeDataProvider<HubTreeItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private data: HygieneReport | null = null;

  refresh(): void { this._onDidChange.fire(); }

  async load(): Promise<void> {
    this.data = await fetchHygiene();
    this.refresh();
  }

  getTreeItem(element: HubTreeItem): HubTreeItem { return element; }

  async getChildren(): Promise<HubTreeItem[]> {
    if (!this.data) {
      await this.load();
      if (!this.data) return [new HubTreeItem("Hub not reachable", undefined, undefined, "warning")];
    }

    if (this.data.findings.length === 0) {
      return [new HubTreeItem("No issues found", "Workspace is clean", undefined, "check")];
    }

    return this.data.findings.slice(0, 20).map((f) => {
      const paths = f.artifacts.map((a) => a.path).join(", ");
      const icon = f.severity === "high" ? "error" : f.severity === "medium" ? "warning" : "info";
      const sim = f.similarity ? ` (${Math.round(f.similarity * 100)}%)` : "";
      const item = new HubTreeItem(
        `[${f.severity.toUpperCase()}] ${f.type}${sim}`,
        paths,
        undefined,
        icon,
      );
      item.tooltip = f.suggestion;
      return item;
    });
  }
}

// ── Decisions provider ────────────────────────────────────────────

export class DecisionsProvider implements vscode.TreeDataProvider<HubTreeItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private decisions: Decision[] = [];
  private counts = { active: 0, superseded: 0, reverted: 0 };

  refresh(): void { this._onDidChange.fire(); }

  async load(): Promise<void> {
    const data = await fetchDecisions();
    if (data) {
      this.decisions = data.decisions;
      this.counts = data.counts;
    }
    this.refresh();
  }

  getTreeItem(element: HubTreeItem): HubTreeItem { return element; }

  async getChildren(): Promise<HubTreeItem[]> {
    if (this.decisions.length === 0) {
      await this.load();
      if (this.decisions.length === 0) {
        return [new HubTreeItem("No decisions tracked", "Scan documents with decision language", undefined, "info")];
      }
    }

    const items: HubTreeItem[] = [];
    items.push(new HubTreeItem(`${this.counts.active} active`, `${this.counts.superseded} superseded`, undefined, "law"));

    for (const d of this.decisions.slice(0, 15)) {
      const icon = d.status === "active" ? "check" : d.status === "superseded" ? "history" : "x";
      const item = new HubTreeItem(d.summary, d.artifactPath, undefined, icon);
      item.tooltip = `${d.status}${d.actor ? ` by ${d.actor}` : ""}${d.decidedAt ? ` on ${d.decidedAt}` : ""}`;
      items.push(item);
    }

    return items;
  }
}

// ── Recently Changed provider ─────────────────────────────────────

export class RecentProvider implements vscode.TreeDataProvider<HubTreeItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private data: ManifestResponse | null = null;

  refresh(): void { this._onDidChange.fire(); }

  async load(): Promise<void> {
    this.data = await fetchManifest();
    this.refresh();
  }

  getTreeItem(element: HubTreeItem): HubTreeItem { return element; }

  async getChildren(): Promise<HubTreeItem[]> {
    if (!this.data) {
      await this.load();
      if (!this.data) return [new HubTreeItem("Hub not reachable", undefined, undefined, "warning")];
    }

    const recent = (this.data.artifacts || [])
      .filter((a) => a.staleDays <= 7)
      .sort((a, b) => a.staleDays - b.staleDays)
      .slice(0, 15);

    if (recent.length === 0) {
      return [new HubTreeItem("No recent changes", "in last 7 days", undefined, "info")];
    }

    return recent.map((a) => {
      const age = a.staleDays === 0 ? "today" : `${a.staleDays}d ago`;
      const item = new HubTreeItem(a.title, `${a.path} — ${age}`, undefined, "file-text");
      item.tooltip = `${a.path}\nGroup: ${a.group}\nType: ${a.type}`;
      return item;
    });
  }
}
