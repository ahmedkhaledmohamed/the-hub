import { NextRequest, NextResponse } from "next/server";
import {
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotationsForArtifact,
  getReplies,
  getAnnotation,
  getRecentAnnotations,
  getAnnotatedArtifacts,
} from "@/lib/annotations";

export const dynamic = "force-dynamic";

/**
 * GET /api/annotations?path=<artifact-path>  — annotations for an artifact
 * GET /api/annotations?replies=<id>          — replies to an annotation
 * GET /api/annotations?recent=true           — recent annotations
 * GET /api/annotations?annotated=true        — artifacts with annotations
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  const repliesId = req.nextUrl.searchParams.get("replies");
  const recent = req.nextUrl.searchParams.get("recent") === "true";
  const annotated = req.nextUrl.searchParams.get("annotated") === "true";

  if (path) {
    return NextResponse.json({ path, annotations: getAnnotationsForArtifact(path) });
  }

  if (repliesId) {
    return NextResponse.json({ parentId: parseInt(repliesId, 10), replies: getReplies(parseInt(repliesId, 10)) });
  }

  if (recent) {
    return NextResponse.json({ annotations: getRecentAnnotations() });
  }

  if (annotated) {
    return NextResponse.json({ artifacts: getAnnotatedArtifacts() });
  }

  return NextResponse.json({ error: "Provide ?path=, ?replies=, ?recent=true, or ?annotated=true" }, { status: 400 });
}

/**
 * POST /api/annotations — create, update, or delete
 * Body: { action: "create", artifactPath, content, author?, lineStart?, lineEnd?, parentId? }
 * Body: { action: "update", id, content }
 * Body: { action: "delete", id }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  if (action === "create") {
    const { artifactPath, content, author, lineStart, lineEnd, parentId } = body as {
      artifactPath?: string; content?: string; author?: string;
      lineStart?: number; lineEnd?: number; parentId?: number;
    };
    if (!artifactPath || !content) {
      return NextResponse.json({ error: "artifactPath and content required" }, { status: 400 });
    }
    const id = addAnnotation({ artifactPath, content, author: author as string, lineStart, lineEnd, parentId });

    // Trigger notification for annotation (notify artifact "owner" — use "default" for now)
    try {
      const { notifyAnnotation } = require("@/lib/notifications");
      notifyAnnotation({
        recipient: "default",
        author: (author as string) || "anonymous",
        artifactPath,
        content,
      });
    } catch { /* notification is non-critical */ }

    return NextResponse.json({ id, created: true });
  }

  if (action === "update") {
    const { id, content } = body as { id?: number; content?: string };
    if (!id || !content) return NextResponse.json({ error: "id and content required" }, { status: 400 });
    const updated = updateAnnotation(id, content);
    return NextResponse.json({ id, updated });
  }

  if (action === "delete") {
    const { id } = body as { id?: number };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const deleted = deleteAnnotation(id);
    return NextResponse.json({ id, deleted });
  }

  return NextResponse.json({ error: "action must be create, update, or delete" }, { status: 400 });
}
