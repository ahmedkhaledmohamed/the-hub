import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const DEFAULT_TTL = 60_000;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const ttl = parseInt(req.nextUrl.searchParams.get("ttl") || "60", 10) * 1000;

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < (ttl || DEFAULT_TTL)) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    cache.set(url, { data, fetchedAt: Date.now() });

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fetch failed" },
      { status: 502 },
    );
  }
}
