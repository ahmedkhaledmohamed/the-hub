/**
 * GitHub plugin for The Hub.
 *
 * Integrates with the GitHub API to surface:
 * - PR counts and issue counts per discovered repo
 * - Recent activity panel (PRs, issues)
 * - Open issues as virtual artifacts (searchable via Cmd+K)
 *
 * Configuration via environment variables:
 *   GITHUB_TOKEN — Personal access token (required)
 *   GITHUB_API_URL — API base URL (default: https://api.github.com)
 */

import type { HubPlugin, Artifact, PanelConfig, Manifest } from "../../src/lib/types";

// ── Types ──────────────────────────────────────────────────────────

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string; color: string }>;
  pull_request?: unknown;
}

interface GitHubPR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  draft: boolean;
  user: { login: string };
}

interface RepoStats {
  owner: string;
  repo: string;
  openPRs: number;
  openIssues: number;
  recentPRs: GitHubPR[];
  recentIssues: GitHubIssue[];
}

// ── Cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── GitHub API ─────────────────────────────────────────────────────

const API_BASE = process.env.GITHUB_API_URL || "https://api.github.com";

function getToken(): string | null {
  return process.env.GITHUB_TOKEN || null;
}

async function githubFetch<T>(path: string): Promise<T | null> {
  const token = getToken();
  if (!token) return null;

  const cacheKey = `gh:${path}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "the-hub-plugin",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 403) {
        console.warn("[github] Rate limited or forbidden");
      }
      return null;
    }

    const data = await res.json();
    setCache(cacheKey, data);
    return data as T;
  } catch (err) {
    console.error("[github] API error:", err);
    return null;
  }
}

// ── Repo extraction ────────────────────────────────────────────────

function extractGitHubRepos(manifest: Manifest): Array<{ owner: string; repo: string }> {
  const repos: Array<{ owner: string; repo: string }> = [];
  const seen = new Set<string>();

  // Look at artifacts for GitHub URLs in workspace paths
  for (const a of manifest.artifacts) {
    // Match patterns like "owner/repo" in paths
    const parts = a.path.split("/");
    if (parts.length >= 2) {
      // This is a heuristic — real implementation would use the repos API
    }
  }

  // Use repos from the Hub's repo discovery if available
  // For now, check env for explicit repos
  const explicitRepos = process.env.GITHUB_REPOS?.split(",").map((r) => r.trim()) || [];
  for (const fullName of explicitRepos) {
    const [owner, repo] = fullName.split("/");
    if (owner && repo && !seen.has(fullName)) {
      seen.add(fullName);
      repos.push({ owner, repo });
    }
  }

  return repos;
}

async function fetchRepoStats(owner: string, repo: string): Promise<RepoStats> {
  const [prs, issues] = await Promise.all([
    githubFetch<GitHubPR[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=10`),
    githubFetch<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?state=open&per_page=10`),
  ]);

  // GitHub's issues endpoint includes PRs — filter them out
  const pureIssues = (issues || []).filter((i) => !i.pull_request);

  return {
    owner,
    repo,
    openPRs: (prs || []).length,
    openIssues: pureIssues.length,
    recentPRs: (prs || []).slice(0, 5),
    recentIssues: pureIssues.slice(0, 5),
  };
}

// ── Plugin ─────────────────────────────────────────────────────────

const plugin: HubPlugin = {
  name: "github",
  version: "1.0.0",
  description: "GitHub integration — PR counts, issues, and activity panels",

  onInit() {
    const token = getToken();
    if (!token) {
      console.log("[github] No GITHUB_TOKEN set — plugin disabled. Set it in .env.local to enable.");
    } else {
      console.log("[github] Plugin initialized with token");
    }
  },

  async onScan(manifest: Manifest): Promise<Artifact[]> {
    if (!getToken()) return [];

    const repos = extractGitHubRepos(manifest);
    const artifacts: Artifact[] = [];

    for (const { owner, repo } of repos) {
      const stats = await fetchRepoStats(owner, repo);

      // Contribute open issues as virtual artifacts
      for (const issue of stats.recentIssues) {
        const labels = issue.labels.map((l) => l.name).join(", ");
        artifacts.push({
          path: `plugin:github/${owner}/${repo}/issues/${issue.number}`,
          title: `#${issue.number}: ${issue.title}`,
          type: "md",
          group: "other",
          modifiedAt: issue.updated_at,
          size: 0,
          staleDays: Math.floor((Date.now() - new Date(issue.updated_at).getTime()) / 86400000),
          snippet: `GitHub issue in ${owner}/${repo}${labels ? ` [${labels}]` : ""} — ${issue.html_url}`,
        });
      }

      // Contribute open PRs as virtual artifacts
      for (const pr of stats.recentPRs) {
        artifacts.push({
          path: `plugin:github/${owner}/${repo}/pulls/${pr.number}`,
          title: `PR #${pr.number}: ${pr.title}`,
          type: "md",
          group: "other",
          modifiedAt: pr.updated_at,
          size: 0,
          staleDays: Math.floor((Date.now() - new Date(pr.updated_at).getTime()) / 86400000),
          snippet: `${pr.draft ? "Draft " : ""}PR by ${pr.user.login} in ${owner}/${repo} — ${pr.html_url}`,
        });
      }
    }

    return artifacts;
  },

  async onSearch(query: string): Promise<Artifact[]> {
    if (!getToken()) return [];

    const q = query.toLowerCase();
    // Only respond to queries that seem GitHub-related
    if (!q.includes("issue") && !q.includes("pr") && !q.includes("pull") && !q.includes("github")) {
      return [];
    }

    const repos = extractGitHubRepos({ generatedAt: "", workspaces: [], groups: [], artifacts: [] });
    const artifacts: Artifact[] = [];

    for (const { owner, repo } of repos) {
      const stats = await fetchRepoStats(owner, repo);
      for (const issue of stats.recentIssues) {
        if (issue.title.toLowerCase().includes(q) || q.includes("issue")) {
          artifacts.push({
            path: `plugin:github/${owner}/${repo}/issues/${issue.number}`,
            title: `#${issue.number}: ${issue.title}`,
            type: "md",
            group: "other",
            modifiedAt: issue.updated_at,
            size: 0,
            staleDays: 0,
            snippet: `GitHub issue — ${issue.html_url}`,
          });
        }
      }
    }

    return artifacts;
  },

  async onRender(): Promise<PanelConfig[]> {
    if (!getToken()) return [];

    const repos = extractGitHubRepos({ generatedAt: "", workspaces: [], groups: [], artifacts: [] });
    if (repos.length === 0) return [];

    const panels: PanelConfig[] = [];

    for (const { owner, repo } of repos) {
      const stats = await fetchRepoStats(owner, repo);

      const prLines = stats.recentPRs.slice(0, 3).map(
        (pr) => `- ${pr.draft ? "📝" : "🔀"} [#${pr.number}](${pr.html_url}): ${pr.title} (${pr.user.login})`
      ).join("\n");

      const issueLines = stats.recentIssues.slice(0, 3).map(
        (i) => `- 🔴 [#${i.number}](${i.html_url}): ${i.title}`
      ).join("\n");

      panels.push({
        type: "custom",
        title: `${owner}/${repo}`,
        badge: { text: `${stats.openPRs} PRs · ${stats.openIssues} issues`, color: "blue" },
        markdown: [
          `### Pull Requests (${stats.openPRs} open)`,
          prLines || "*No open PRs*",
          "",
          `### Issues (${stats.openIssues} open)`,
          issueLines || "*No open issues*",
        ].join("\n"),
      });
    }

    return panels;
  },
};

export default plugin;

// Export helpers for testing
export { getToken, extractGitHubRepos, getCached, setCache, cache };
