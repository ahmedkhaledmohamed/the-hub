import { NextRequest, NextResponse } from "next/server";
import {
  linkDoc,
  unlinkDoc,
  getLinkedDoc,
  getAllLinkedDocs,
  pullDoc,
  syncAllDocs,
  getSyncSummary,
  isGoogleDocsConfigured,
  parseDocId,
} from "@/lib/google-docs";

export const dynamic = "force-dynamic";

/**
 * GET /api/google-docs              — list linked docs + summary
 * GET /api/google-docs?docId=<id>   — specific linked doc
 */
export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get("docId");

  if (docId) {
    const link = getLinkedDoc(parseDocId(docId));
    if (!link) return NextResponse.json({ error: "Not linked" }, { status: 404 });
    return NextResponse.json(link);
  }

  return NextResponse.json({
    configured: isGoogleDocsConfigured(),
    links: getAllLinkedDocs(),
    summary: getSyncSummary(),
  });
}

/**
 * POST /api/google-docs
 * { action: "link", docId, artifactPath, title?, syncDirection? }
 * { action: "unlink", docId }
 * { action: "pull", docId }
 * { action: "sync-all" }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "link") {
    const { docId, artifactPath, title, syncDirection } = body as {
      docId?: string; artifactPath?: string; title?: string; syncDirection?: string;
    };
    if (!docId || !artifactPath) {
      return NextResponse.json({ error: "docId and artifactPath required" }, { status: 400 });
    }
    const id = linkDoc({
      docId: parseDocId(docId),
      artifactPath,
      title,
      syncDirection: syncDirection as "pull" | "push" | "both" | undefined,
    });
    return NextResponse.json({ id, linked: true });
  }

  if (action === "unlink") {
    const { docId } = body as { docId?: string };
    if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });
    const removed = unlinkDoc(parseDocId(docId));
    return NextResponse.json({ docId, removed });
  }

  if (action === "pull") {
    const { docId } = body as { docId?: string };
    if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });
    const result = await pullDoc(parseDocId(docId));
    return NextResponse.json(result);
  }

  if (action === "sync-all") {
    const results = await syncAllDocs();
    return NextResponse.json({ results, summary: getSyncSummary() });
  }

  return NextResponse.json({ error: "action must be link, unlink, pull, or sync-all" }, { status: 400 });
}
