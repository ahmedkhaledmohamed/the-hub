import { NextResponse } from "next/server";
import { loadConfig, getResolvedWorkspacePaths } from "@/lib/config";
import { discoverRepos } from "@/lib/repo-scanner";

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
