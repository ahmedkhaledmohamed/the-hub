import { NextRequest, NextResponse } from "next/server";
import {
  getGraphData,
  getBacklinks,
  getLinksFrom,
  addLink,
  removeLink,
  syncWikiLinks,
  getLinkCount,
} from "@/lib/knowledge-graph";
import type { LinkType } from "@/lib/knowledge-graph";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/graph                     — full graph data (nodes + edges)
 * GET /api/graph?backlinks=<path>    — backlinks for an artifact
 * GET /api/graph?links=<path>        — outgoing links from an artifact
 * GET /api/graph?sync=true           — re-scan wiki-links in markdown files
 */
export async function GET(req: NextRequest) {
  const backlinksPath = req.nextUrl.searchParams.get("backlinks");
  const linksPath = req.nextUrl.searchParams.get("links");
  const sync = req.nextUrl.searchParams.get("sync");

  if (backlinksPath) {
    const backlinks = getBacklinks(backlinksPath);
    return NextResponse.json({ path: backlinksPath, backlinks });
  }

  if (linksPath) {
    const links = getLinksFrom(linksPath);
    return NextResponse.json({ path: linksPath, links });
  }

  if (sync === "true") {
    const manifest = getManifest();
    const result = syncWikiLinks(manifest.artifacts);
    return NextResponse.json({
      synced: true,
      created: result.created,
      totalLinks: getLinkCount(),
    });
  }

  // Default: return full graph
  const data = getGraphData();
  return NextResponse.json({
    nodes: data.nodes,
    edges: data.edges,
    totalLinks: getLinkCount(),
  });
}

/**
 * POST /api/graph — create or delete a link
 * Body: { action: "add" | "remove", sourcePath, targetPath, linkType }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, sourcePath, targetPath, linkType } = body as {
    action: "add" | "remove";
    sourcePath: string;
    targetPath: string;
    linkType: LinkType;
  };

  if (!sourcePath || !targetPath || !linkType) {
    return NextResponse.json({ error: "sourcePath, targetPath, and linkType required" }, { status: 400 });
  }

  if (typeof sourcePath !== "string" || typeof targetPath !== "string" || sourcePath.length > 500 || targetPath.length > 500) {
    return NextResponse.json({ error: "Invalid path format" }, { status: 400 });
  }

  if (!["references", "supersedes", "related"].includes(linkType)) {
    return NextResponse.json({ error: "linkType must be: references, supersedes, or related" }, { status: 400 });
  }

  if (action === "add") {
    addLink(sourcePath, targetPath, linkType);
    return NextResponse.json({ added: true, sourcePath, targetPath, linkType });
  }

  if (action === "remove") {
    removeLink(sourcePath, targetPath, linkType);
    return NextResponse.json({ removed: true, sourcePath, targetPath, linkType });
  }

  return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
}
