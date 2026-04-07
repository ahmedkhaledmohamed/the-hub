import { NextRequest, NextResponse } from "next/server";
import { loadConfig, getResolvedWorkspacePaths } from "@/lib/config";
import { discoverRepos, pullRepo, pullAllRepos } from "@/lib/repo-scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = loadConfig();
  const workspaces = config.workspaces.map((w, i) => ({
    ...w,
    path: getResolvedWorkspacePaths(config)[i],
  }));

  const repos = discoverRepos(workspaces);
  return NextResponse.json({ repos });
}

/**
 * POST /api/repos
 * { action: "pull", path: "/path/to/repo" } — pull a single repo
 * { action: "pull-all" }                     — pull all discovered repos
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const config = loadConfig();
  const workspaces = config.workspaces.map((w, i) => ({
    ...w,
    path: getResolvedWorkspacePaths(config)[i],
  }));

  if (body.action === "pull" && typeof body.path === "string") {
    // Verify the path is a known repo
    const repos = discoverRepos(workspaces);
    const repo = repos.find((r) => r.path === body.path);
    if (!repo) return NextResponse.json({ error: `Unknown repo: ${body.path}` }, { status: 404 });

    const result = pullRepo(body.path);
    return NextResponse.json(result);
  }

  if (body.action === "pull-all") {
    const results = pullAllRepos(workspaces);
    const succeeded = results.filter((r) => r.success).length;
    return NextResponse.json({ results, total: results.length, succeeded, failed: results.length - succeeded });
  }

  return NextResponse.json({ error: "action must be 'pull' or 'pull-all'" }, { status: 400 });
}
