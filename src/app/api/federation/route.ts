import { NextRequest, NextResponse } from "next/server";
import {
  federatedSearch,
  checkPeerHealth,
  getPeers,
  hasPeers,
} from "@/lib/federation";
import { searchArtifacts } from "@/lib/db";
import { isRouteDeprecated, addDeprecationHeaders } from "@/lib/deprecation";

export const dynamic = "force-dynamic";

// This route is deprecated in v5 — see /api/deprecated for details

/**
 * GET /api/federation                — peer status and health
 * GET /api/federation?search=<query> — federated search (local + peers)
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("search");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10", 10);

  if (query) {
    // Federated search: local + all peers
    const [localResults, peerResults] = await Promise.all([
      Promise.resolve(searchArtifacts(query, limit)),
      federatedSearch(query, limit),
    ]);

    const local = localResults.map((r) => ({
      path: r.path,
      title: r.title,
      type: r.type,
      group: r.group,
      snippet: r.snippet,
      source: "local",
      sourceUrl: "",
    }));

    return NextResponse.json({
      query,
      results: [...local, ...peerResults],
      localCount: local.length,
      peerCount: peerResults.length,
    });
  }

  // Default: peer status
  const peers = getPeers();
  const health = await checkPeerHealth();

  return NextResponse.json({
    federation: hasPeers(),
    peerCount: peers.length,
    peers: health,
  });
}
