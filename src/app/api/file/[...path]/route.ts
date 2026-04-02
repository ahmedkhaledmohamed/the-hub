import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { loadConfig } from "@/lib/config";
import { renderMarkdown, wrapInHtmlShell } from "@/lib/markdown";

export const dynamic = "force-dynamic";

function resolveFilePath(segments: string[]): string | null {
  const config = loadConfig();
  const requestedPath = segments.join("/");

  for (const workspace of config.workspaces) {
    const wsName = path.basename(workspace.path);
    if (requestedPath.startsWith(wsName + "/")) {
      const relPath = requestedPath.slice(wsName.length + 1);
      const fullPath = path.join(workspace.path, relPath);
      return fullPath;
    }
  }

  return null;
}

function isPathSafe(filePath: string): boolean {
  const config = loadConfig();
  let realPath: string;
  try {
    realPath = fs.realpathSync(filePath);
  } catch {
    return false;
  }

  // Build allowed roots: workspace paths + all symlink targets within them
  const allowedRoots: string[] = [];
  for (const w of config.workspaces) {
    try {
      allowedRoots.push(fs.realpathSync(w.path));
      // Also resolve symlinks within the workspace root
      const entries = fs.readdirSync(w.path);
      for (const entry of entries) {
        const full = path.join(w.path, entry);
        try {
          if (fs.lstatSync(full).isSymbolicLink()) {
            const target = fs.realpathSync(full);
            if (fs.statSync(target).isDirectory()) {
              allowedRoots.push(target);
            }
          }
        } catch { /* skip broken symlinks */ }
      }
    } catch { /* skip */ }
  }

  return allowedRoots.some(
    (root) => realPath === root || realPath.startsWith(root + path.sep),
  );
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/html; charset=utf-8",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = resolveFilePath(segments);

  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isPathSafe(filePath)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".md") {
    const content = fs.readFileSync(filePath, "utf8");
    const html = renderMarkdown(content);
    const title = path.basename(filePath);
    const fullHtml = wrapInHtmlShell(html, title);
    return new NextResponse(fullHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  const buffer = fs.readFileSync(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "no-cache",
    },
  });
}
