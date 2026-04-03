import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import type { RepoInfo, WorkspaceConfig } from "./types";

function readGitHead(gitDir: string): string {
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf-8").trim();
    if (head.startsWith("ref: refs/heads/")) return head.slice("ref: refs/heads/".length);
    return head.slice(0, 8);
  } catch {
    return "unknown";
  }
}

function readGitRemote(gitDir: string): string {
  try {
    const config = readFileSync(join(gitDir, "config"), "utf-8");
    const match = config.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

function remoteToBrowseUrl(remote: string): string {
  if (!remote) return "";
  // git@github.com:org/repo.git → https://github.com/org/repo
  let url = remote
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\.git$/, "");
  // ssh://git@... → https://...
  url = url.replace(/^ssh:\/\/git@/, "https://");
  return url;
}

function getLastActivity(gitDir: string): string {
  const candidates = ["FETCH_HEAD", "HEAD", "index"];
  for (const ref of candidates) {
    const p = join(gitDir, ref);
    try {
      if (existsSync(p)) return statSync(p).mtime.toISOString();
    } catch { /* skip */ }
  }
  return "";
}

export function discoverRepos(workspaces: WorkspaceConfig[]): RepoInfo[] {
  const repos: RepoInfo[] = [];
  const seen = new Set<string>();

  for (const ws of workspaces) {
    const wsPath = ws.path;
    if (!existsSync(wsPath)) continue;

    // Check if workspace root itself is a repo
    const rootGit = join(wsPath, ".git");
    if (existsSync(rootGit)) {
      addRepo(repos, seen, wsPath, ws.label, rootGit);
    }

    // Scan one level deep for repos
    let entries: string[];
    try {
      entries = readdirSync(wsPath, { withFileTypes: true })
        .filter((d) => d.isDirectory() || d.isSymbolicLink())
        .map((d) => d.name);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(wsPath, entry);
      const gitDir = join(entryPath, ".git");
      if (existsSync(gitDir)) {
        addRepo(repos, seen, entryPath, ws.label, gitDir);
      }

      // Scan two levels deep for nested structures (e.g. backend/goodfeathers)
      try {
        const subEntries = readdirSync(entryPath, { withFileTypes: true })
          .filter((d) => d.isDirectory() || d.isSymbolicLink())
          .map((d) => d.name);
        for (const sub of subEntries) {
          const subPath = join(entryPath, sub);
          const subGitDir = join(subPath, ".git");
          if (existsSync(subGitDir)) {
            addRepo(repos, seen, subPath, ws.label, subGitDir);
          }
        }
      } catch { /* not readable */ }
    }
  }

  repos.sort((a, b) => {
    if (a.workspace !== b.workspace) return a.workspace.localeCompare(b.workspace);
    return a.name.localeCompare(b.name);
  });

  return repos;
}

function addRepo(repos: RepoInfo[], seen: Set<string>, repoPath: string, workspace: string, gitDir: string) {
  let realGitDir = gitDir;
  try {
    // Handle git worktrees: .git can be a file pointing to the actual gitdir
    const gitStat = statSync(gitDir);
    if (!gitStat.isDirectory()) {
      const content = readFileSync(gitDir, "utf-8").trim();
      const match = content.match(/^gitdir:\s*(.+)/);
      if (match) realGitDir = join(repoPath, match[1]);
    }
  } catch { /* use gitDir as-is */ }

  const realPath = repoPath;
  if (seen.has(realPath)) return;
  seen.add(realPath);

  const remote = readGitRemote(realGitDir);

  repos.push({
    name: basename(repoPath),
    path: realPath,
    workspace,
    branch: readGitHead(realGitDir),
    remoteUrl: remote,
    browseUrl: remoteToBrowseUrl(remote),
    lastActivity: getLastActivity(realGitDir),
    hasClaudeFile: existsSync(join(repoPath, "CLAUDE.md")),
    hasCursorRules: existsSync(join(repoPath, ".cursor", "rules")) || existsSync(join(repoPath, ".cursorrules")),
  });
}
