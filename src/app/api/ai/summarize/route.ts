import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { getArtifactContent } from "@/lib/db";
import { summarizeContent, summarizeGroup, getBulkSummaries } from "@/lib/summarizer";
import { contentHash } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/summarize?path=<artifact-path>
 *   Returns the summary for a single artifact.
 *
 * GET /api/ai/summarize?group=<group-id>
 *   Returns an aggregate summary for all artifacts in a group.
 *
 * GET /api/ai/summarize?bulk=true
 *   Returns all cached summaries for current manifest artifacts.
 */
export async function GET(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json({
      error: "AI not configured. Set AI_GATEWAY_URL and AI_GATEWAY_KEY in .env.local",
    }, { status: 503 });
  }

  const path = req.nextUrl.searchParams.get("path");
  const groupId = req.nextUrl.searchParams.get("group");
  const bulk = req.nextUrl.searchParams.get("bulk");

  // Bulk: return all cached summaries
  if (bulk === "true") {
    const manifest = getManifest();
    const hashMap = new Map<string, string>();
    for (const a of manifest.artifacts) {
      const content = getArtifactContent(a.path);
      if (content) {
        hashMap.set(a.path, contentHash(content));
      }
    }
    const summaries = getBulkSummaries(hashMap);
    return NextResponse.json({
      summaries: Object.fromEntries(summaries),
      count: summaries.size,
    });
  }

  // Single artifact summary
  if (path) {
    const content = getArtifactContent(path);
    if (!content) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    const result = await summarizeContent(content);
    if (!result) {
      return NextResponse.json({
        error: "Content too short for summarization (minimum 500 words)",
      }, { status: 422 });
    }

    return NextResponse.json({
      path,
      summary: result.summary,
      cached: result.cached,
    });
  }

  // Group summary
  if (groupId) {
    const manifest = getManifest();
    const groupArtifacts = manifest.artifacts.filter((a) => a.group === groupId);

    if (groupArtifacts.length === 0) {
      return NextResponse.json({ error: `Group "${groupId}" not found or empty` }, { status: 404 });
    }

    const artifactsWithContent = groupArtifacts
      .map((a) => ({
        title: a.title,
        content: getArtifactContent(a.path) || "",
      }))
      .filter((a) => a.content.length > 0);

    const result = await summarizeGroup(artifactsWithContent);
    if (!result) {
      return NextResponse.json({ error: "Could not generate summary" }, { status: 500 });
    }

    return NextResponse.json({
      group: groupId,
      artifactCount: artifactsWithContent.length,
      summary: result.summary,
      cached: result.cached,
    });
  }

  return NextResponse.json({ error: "Provide ?path=, ?group=, or ?bulk=true" }, { status: 400 });
}
