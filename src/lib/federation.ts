/**
 * Hub-to-Hub federation — search and read across linked Hub instances.
 *
 * Each peer is another Hub instance accessible via HTTP.
 * Search queries are proxied to peers and results merged with a source tag.
 */

import { loadConfig } from "./config";
import type { PeerConfig, FederationConfig } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface FederatedResult {
  path: string;
  title: string;
  type: string;
  group: string;
  snippet: string;
  source: string; // peer name
  sourceUrl: string; // peer base URL
}

// ── Configuration ──────────────────────────────────────────────────

export function getFederationConfig(): FederationConfig | null {
  try {
    const config = loadConfig();
    return config.federation || null;
  } catch {
    return null;
  }
}

export function getPeers(): PeerConfig[] {
  const fed = getFederationConfig();
  if (!fed) return [];
  return fed.peers.filter((p) => p.enabled !== false);
}

export function hasPeers(): boolean {
  return getPeers().length > 0;
}

export function getPeerByName(name: string): PeerConfig | null {
  return getPeers().find((p) => p.name === name) || null;
}

// ── Peer communication ─────────────────────────────────────────────

async function fetchFromPeer<T>(peer: PeerConfig, path: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (peer.apiKey) {
      headers["Authorization"] = `Bearer ${peer.apiKey}`;
    }

    const res = await fetch(`${peer.url}${path}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ── Federated search ───────────────────────────────────────────────

interface PeerSearchResponse {
  results: Array<{
    path: string;
    title: string;
    type: string;
    group: string;
    snippet: string;
  }>;
}

export async function federatedSearch(query: string, limit = 5): Promise<FederatedResult[]> {
  const peers = getPeers();
  if (peers.length === 0) return [];

  const results: FederatedResult[] = [];

  // Query all peers in parallel
  const promises = peers.map(async (peer) => {
    const data = await fetchFromPeer<PeerSearchResponse>(
      peer,
      `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );

    if (data?.results) {
      for (const r of data.results) {
        results.push({
          ...r,
          source: peer.name,
          sourceUrl: peer.url,
        });
      }
    }
  });

  await Promise.all(promises);
  return results;
}

// ── Fetch artifact from peer ───────────────────────────────────────

export async function fetchPeerArtifact(peerName: string, artifactPath: string): Promise<string | null> {
  const peer = getPeerByName(peerName);
  if (!peer) return null;

  const data = await fetchFromPeer<PeerSearchResponse>(
    peer,
    `/api/search?q=${encodeURIComponent(artifactPath)}&limit=1`,
  );

  return data?.results?.[0]?.snippet || null;
}

// ── Peer health check ──────────────────────────────────────────────

export interface PeerStatus {
  name: string;
  url: string;
  online: boolean;
  artifactCount?: number;
  groupCount?: number;
}

export async function checkPeerHealth(): Promise<PeerStatus[]> {
  const peers = getPeers();

  const statuses = await Promise.all(
    peers.map(async (peer) => {
      const data = await fetchFromPeer<{
        artifacts: unknown[];
        groups: unknown[];
      }>(peer, "/api/manifest");

      return {
        name: peer.name,
        url: peer.url,
        online: data !== null,
        artifactCount: data?.artifacts?.length,
        groupCount: data?.groups?.length,
      };
    }),
  );

  return statuses;
}
