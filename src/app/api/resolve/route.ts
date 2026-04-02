import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { loadConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const artifactPath = request.nextUrl.searchParams.get("path");
  if (!artifactPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const config = loadConfig();

  for (const workspace of config.workspaces) {
    const wsName = path.basename(workspace.path);
    if (artifactPath.startsWith(wsName + "/")) {
      const relPath = artifactPath.slice(wsName.length + 1);
      const absPath = path.join(workspace.path, relPath);
      const dirPath = path.dirname(absPath);
      return NextResponse.json({ absPath, dirPath, wsName });
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
