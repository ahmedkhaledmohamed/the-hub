import { NextRequest, NextResponse } from "next/server";
import { searchArtifacts } from "@/lib/db";
import { hybridSearch, getEmbeddingCount } from "@/lib/embeddings";
import { trackSearch } from "@/lib/activity";
import { getSearchCache, buildSearchCacheKey } from "@/lib/search-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10), 100);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") || "0", 10), 0);
  const mode = req.nextUrl.searchParams.get("mode") || "auto";

  if (!q) {
    return NextResponse.json({ results: [], query: "", total: 0, limit, offset, hasMore: false });
  }

  const useHybrid = mode === "hybrid" || mode === "semantic" || (mode === "auto" && getEmbeddingCount() > 0);
  const actualMode = useHybrid ? "hybrid" : "fts";

  // Check cache first
  const cache = getSearchCache();
  const cacheKey = buildSearchCacheKey(q, limit, offset, actualMode);
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ ...(cached as Record<string, unknown>), cached: true });
  }

  // Fetch limit + 1 to detect hasMore without a separate count query
  const fetchLimit = limit + offset + 1;

  let response: Record<string, unknown>;

  if (useHybrid) {
    const allResults = await hybridSearch(q, fetchLimit);
    const paged = allResults.slice(offset, offset + limit);
    const hasMore = allResults.length > offset + limit;
    try { trackSearch(q, allResults.length); } catch (err) { try { const { reportError } = require("@/lib/error-reporter"); reportError("search", err, { query: q }); } catch { /* non-critical */ } }

    response = {
      query: q,
      mode: "hybrid",
      results: paged.map((r) => ({
        path: r.path, title: r.title, type: r.type,
        group: r.group, snippet: r.snippet, score: r.score, source: r.source,
      })),
      total: allResults.length > fetchLimit - 1 ? fetchLimit : allResults.length,
      count: paged.length,
      limit,
      offset,
      hasMore,
      cached: false,
    };
  } else {
    const allResults = searchArtifacts(q, fetchLimit);
    const paged = allResults.slice(offset, offset + limit);
    const hasMore = allResults.length > offset + limit;
    try { trackSearch(q, allResults.length); } catch (err) { try { const { reportError } = require("@/lib/error-reporter"); reportError("search", err, { query: q }); } catch { /* non-critical */ } }

    response = {
      query: q,
      mode: "fts",
      results: paged.map((r) => ({
        path: r.path, title: r.title, type: r.type,
        group: r.group, snippet: r.snippet,
      })),
      total: allResults.length > fetchLimit - 1 ? fetchLimit : allResults.length,
      count: paged.length,
      limit,
      offset,
      hasMore,
      cached: false,
    };
  }

  // Store in cache
  cache.set(cacheKey, response);

  return NextResponse.json(response);
}
