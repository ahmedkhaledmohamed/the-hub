"use client";

import { useState, useEffect, useMemo } from "react";
import {
  GitBranch, ExternalLink, FolderOpen, Search, Bot, FileCode2,
  RefreshCw,
} from "lucide-react";
import type { RepoInfo } from "@/lib/types";
import { relativeTime, cn } from "@/lib/utils";

export function RepoList() {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/repos");
      const data = await res.json();
      setRepos(data.repos);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRepos(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.workspace.toLowerCase().includes(q) ||
        r.remoteUrl.toLowerCase().includes(q),
    );
  }, [repos, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, RepoInfo[]>();
    for (const r of filtered) {
      if (!map.has(r.workspace)) map.set(r.workspace, []);
      map.get(r.workspace)!.push(r);
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const withClaude = repos.filter((r) => r.hasClaudeFile).length;
    const withCursor = repos.filter((r) => r.hasCursorRules).length;
    const workspaces = new Set(repos.map((r) => r.workspace)).size;
    return { total: repos.length, workspaces, withClaude, withCursor };
  }, [repos]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-5">
        <h1 className="text-lg font-semibold">Connected Repos</h1>
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter repos..."
            className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded text-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-3 ml-auto text-[12px] text-text-dim">
          <span><strong className="text-text-muted">{stats.total}</strong> repos</span>
          <span><strong className="text-text-muted">{stats.workspaces}</strong> workspaces</span>
          <span title="Repos with CLAUDE.md"><Bot size={11} /> {stats.withClaude}</span>
          <span title="Repos with .cursor/rules"><FileCode2 size={11} /> {stats.withCursor}</span>
          <button
            onClick={fetchRepos}
            disabled={loading}
            className="text-text-dim hover:text-accent transition-colors disabled:opacity-50"
            title="Rescan"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && repos.length === 0 ? (
        <div className="text-center py-16 text-text-dim text-[13px]">Scanning workspaces for repos...</div>
      ) : (
        Array.from(grouped.entries()).map(([workspace, wsRepos]) => (
          <section key={workspace} className="mb-6">
            <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border">
              <h2 className="text-[14px] font-semibold text-accent">{workspace}</h2>
              <span className="text-[11px] text-text-dim bg-surface px-2 py-0.5 rounded-full">
                {wsRepos.length}
              </span>
            </div>
            <div className="space-y-1">
              {wsRepos.map((repo) => (
                <RepoCard key={repo.path} repo={repo} />
              ))}
            </div>
          </section>
        ))
      )}

      {!loading && filtered.length === 0 && search && (
        <div className="text-center py-12 text-text-muted text-[13px]">
          No repos match &quot;{search}&quot;
        </div>
      )}
    </div>
  );
}

function RepoCard({ repo }: { repo: RepoInfo }) {
  const cursorUri = `cursor://file${repo.path}`;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-surface border border-transparent rounded-md hover:border-border transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text truncate">{repo.name}</span>
          {repo.hasClaudeFile && (
            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple/20 text-purple shrink-0" title="Has CLAUDE.md">
              claude
            </span>
          )}
          {repo.hasCursorRules && (
            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0" title="Has .cursor/rules">
              cursor
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-dim">
          <span className="flex items-center gap-1">
            <GitBranch size={10} />
            {repo.branch}
          </span>
          {repo.lastActivity && (
            <span>active {relativeTime(repo.lastActivity)}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {repo.browseUrl && (
          <a
            href={repo.browseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-surface-hover text-text-dim hover:text-accent transition-colors"
            title="Open in browser"
          >
            <ExternalLink size={13} />
          </a>
        )}
        <a
          href={cursorUri}
          className="p-1.5 rounded hover:bg-surface-hover text-text-dim hover:text-accent transition-colors"
          title="Open in Cursor"
        >
          <FolderOpen size={13} />
        </a>
      </div>
    </div>
  );
}
