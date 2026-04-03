import { NextRequest, NextResponse } from "next/server";
import { searchArtifacts } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);

  if (!q) {
    return NextResponse.json({ results: [], query: "" });
  }

  const results = searchArtifacts(q, Math.min(limit, 50));

  return NextResponse.json({
    query: q,
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
