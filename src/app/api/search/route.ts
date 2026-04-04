import { NextRequest, NextResponse } from "next/server";
import { searchArtifacts } from "@/lib/db";
import { hybridSearch, getEmbeddingCount } from "@/lib/embeddings";
import { trackSearch } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
  const mode = req.nextUrl.searchParams.get("mode") || "auto"; // "fts", "semantic", "hybrid", "auto"

  if (!q) {
    return NextResponse.json({ results: [], query: "" });
  }

  const cappedLimit = Math.min(limit, 50);

  // Auto mode: use hybrid if embeddings exist, otherwise FTS only
  const useHybrid = mode === "hybrid" || mode === "semantic" || (mode === "auto" && getEmbeddingCount() > 0);

  if (useHybrid) {
    const results = await hybridSearch(q, cappedLimit);
    try { trackSearch(q, results.length); } catch { /* non-fatal */ }
    return NextResponse.json({
      query: q,
      mode: "hybrid",
      results: results.map((r) => ({
        path: r.path,
        title: r.title,
        type: r.type,
        group: r.group,
        snippet: r.snippet,
        score: r.score,
        source: r.source,
      })),
      count: results.length,
    });
  }

  // FTS-only fallback
  const results = searchArtifacts(q, cappedLimit);
  try { trackSearch(q, results.length); } catch { /* non-fatal */ }
  return NextResponse.json({
    query: q,
    mode: "fts",
    results: results.map((r) => ({
      path: r.path,
      title: r.title,
      type: r.type,
      group: r.group,
      snippet: r.snippet,
    })),
    count: results.length,
  });
}
