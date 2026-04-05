import { NextRequest, NextResponse } from "next/server";
import {
  linkPage,
  unlinkPage,
  getLinkedPage,
  getAllLinkedPages,
  getLinkedPagesByParent,
  pullPage,
  syncAllPages,
  getNotionSyncSummary,
  isNotionConfigured,
  parsePageId,
} from "@/lib/notion-sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/notion                     — list linked pages + summary
 * GET /api/notion?pageId=<id>         — specific linked page
 * GET /api/notion?parentId=<id>       — pages under a parent
 */
export async function GET(req: NextRequest) {
  const pageId = req.nextUrl.searchParams.get("pageId");
  const parentId = req.nextUrl.searchParams.get("parentId");

  if (pageId) {
    const link = getLinkedPage(parsePageId(pageId));
    if (!link) return NextResponse.json({ error: "Not linked" }, { status: 404 });
    return NextResponse.json(link);
  }

  if (parentId) {
    return NextResponse.json({ parentId, pages: getLinkedPagesByParent(parentId) });
  }

  return NextResponse.json({
    configured: isNotionConfigured(),
    pages: getAllLinkedPages(),
    summary: getNotionSyncSummary(),
  });
}

/**
 * POST /api/notion
 * { action: "link", pageId, artifactPath, title?, parentType?, parentId? }
 * { action: "unlink", pageId }
 * { action: "pull", pageId }
 * { action: "sync-all" }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "link") {
    const { pageId, artifactPath, title, parentType, parentId } = body as {
      pageId?: string; artifactPath?: string; title?: string;
      parentType?: "page" | "database" | "workspace"; parentId?: string;
    };
    if (!pageId || !artifactPath) {
      return NextResponse.json({ error: "pageId and artifactPath required" }, { status: 400 });
    }
    const id = linkPage({ pageId: parsePageId(pageId), artifactPath, title, parentType, parentId });
    return NextResponse.json({ id, linked: true });
  }

  if (action === "unlink") {
    const { pageId } = body as { pageId?: string };
    if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });
    const removed = unlinkPage(parsePageId(pageId));
    return NextResponse.json({ pageId, removed });
  }

  if (action === "pull") {
    const { pageId } = body as { pageId?: string };
    if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });
    const result = await pullPage(parsePageId(pageId));
    return NextResponse.json(result);
  }

  if (action === "sync-all") {
    const results = await syncAllPages();
    return NextResponse.json({ results, summary: getNotionSyncSummary() });
  }

  return NextResponse.json({ error: "action must be link, unlink, pull, or sync-all" }, { status: 400 });
}
