/**
 * Embedding-based semantic search for The Hub.
 *
 * Stores embeddings as JSON arrays in SQLite. Computes cosine similarity
 * in JS for portability (no native vector extensions required).
 *
 * Embedding generation uses the AI gateway's embedding endpoint,
 * falling back gracefully when not configured.
 */

import { getDb, contentHash, searchArtifacts } from "./db";

// ── Schema ─────────────────────────────────────────────────────────

function ensureEmbeddingsTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      content_hash  TEXT PRIMARY KEY,
      path          TEXT NOT NULL,
      chunk_index   INTEGER NOT NULL DEFAULT 0,
      embedding     TEXT NOT NULL,
      dimensions    INTEGER NOT NULL,
      model         TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_path ON embeddings(path);
  `);
}

// ── Types ──────────────────────────────────────────────────────────

export interface EmbeddingRecord {
  path: string;
  chunkIndex: number;
  embedding: number[];
  contentHash: string;
}

export interface SemanticSearchResult {
  path: string;
  title: string;
  type: string;
  group: string;
  snippet: string;
  score: number;
  source: "semantic" | "fts" | "hybrid";
}

// ── Vector math ────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Text chunking ──────────────────────────────────────────────────

const CHUNK_SIZE = 500; // ~500 tokens worth of text
const CHUNK_OVERLAP = 50;

export function chunkText(text: string, maxChunkSize = CHUNK_SIZE): string[] {
  const words = text.split(/\s+/);
  if (words.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxChunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    start = end - CHUNK_OVERLAP;
    if (start >= words.length) break;
  }

  return chunks;
}

// ── Embedding generation ───────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Try explicit gateway first
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_KEY;

  if (gatewayUrl && apiKey) {
    const embeddingsUrl = gatewayUrl.replace(/\/chat\/completions\/?$/, "/embeddings");
    try {
      const res = await fetch(embeddingsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
          input: text.slice(0, 8000),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.data?.[0]?.embedding || null;
      }
    } catch (err) {
      try { const { reportError } = require("./error-reporter"); reportError("ai", err, { operation: "embedding-gateway" }); } catch { /* non-critical */ }
    }
  }

  // Try Ollama embeddings
  if (process.env.AI_PROVIDER === "ollama" || (!gatewayUrl && !apiKey)) {
    const ollamaUrl = process.env.OLLAMA_URL?.replace(/\/v1\/chat\/completions\/?$/, "") || "http://localhost:11434";
    try {
      const res = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.AI_EMBEDDING_MODEL || "nomic-embed-text",
          prompt: text.slice(0, 8000),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.embedding || null;
      }
    } catch (err) {
      try { const { reportError } = require("./error-reporter"); reportError("ai", err, { operation: "embedding-ollama" }); } catch { /* non-critical */ }
    }
  }

  return null;
}

// ── Storage ────────────────────────────────────────────────────────

export function storeEmbedding(path: string, chunkIndex: number, hash: string, embedding: number[], model: string): void {
  try {
    ensureEmbeddingsTable();
    const db = getDb();
    db.prepare(`
      INSERT INTO embeddings (content_hash, path, chunk_index, embedding, dimensions, model)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_hash) DO UPDATE SET
        path = excluded.path,
        chunk_index = excluded.chunk_index,
        embedding = excluded.embedding,
        dimensions = excluded.dimensions,
        model = excluded.model,
        created_at = datetime('now')
    `).run(hash, path, chunkIndex, JSON.stringify(embedding), embedding.length, model);
  } catch {
    // Non-fatal
  }
}

export function getStoredEmbeddings(): EmbeddingRecord[] {
  try {
    ensureEmbeddingsTable();
    const db = getDb();
    const rows = db.prepare(
      "SELECT path, chunk_index, embedding, content_hash FROM embeddings"
    ).all() as Array<{ path: string; chunk_index: number; embedding: string; content_hash: string }>;

    return rows.map((r) => ({
      path: r.path,
      chunkIndex: r.chunk_index,
      embedding: JSON.parse(r.embedding),
      contentHash: r.content_hash,
    }));
  } catch {
    return [];
  }
}

export function hasEmbedding(hash: string): boolean {
  try {
    ensureEmbeddingsTable();
    const db = getDb();
    const row = db.prepare("SELECT 1 FROM embeddings WHERE content_hash = ?").get(hash);
    return !!row;
  } catch {
    return false;
  }
}

export function getEmbeddingCount(): number {
  try {
    ensureEmbeddingsTable();
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM embeddings").get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

// ── Semantic search ────────────────────────────────────────────────

export async function semanticSearch(query: string, limit = 10): Promise<SemanticSearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  // Try vector index first (pre-computed norms, faster)
  let vectorResults: Array<{ path: string; score: number }> | null = null;
  try {
    const { isIndexStale, buildIndex, searchIndex, getIndexSize } = require("./vector-index");

    // Build/rebuild index if stale or empty
    if (isIndexStale() || getIndexSize() === 0) {
      const stored = getStoredEmbeddings();
      if (stored.length > 0) {
        buildIndex(stored);
        try {
          const { hubLog } = require("./logger");
          hubLog("info", "search", "Vector index built", { vectors: stored.length });
        } catch { /* non-critical */ }
      }
    }

    if (getIndexSize() > 0) {
      vectorResults = searchIndex(queryEmbedding, { topK: limit, minScore: 0.1 });
    }
  } catch { /* vector-index module may not be available */ }

  // Enrich results with artifact metadata
  const enrichResults = (results: Array<{ path: string; score: number }>): SemanticSearchResult[] => {
    const db = getDb();
    const getArtifact = db.prepare('SELECT title, type, "group", snippet FROM artifacts WHERE path = ?');
    return results.slice(0, limit).map((s) => {
      const artifact = getArtifact.get(s.path) as { title: string; type: string; group: string; snippet: string } | undefined;
      return {
        path: s.path,
        title: artifact?.title || s.path,
        type: artifact?.type || "unknown",
        group: artifact?.group || "other",
        snippet: artifact?.snippet || "",
        score: Math.round(s.score * 1000) / 1000,
        source: "semantic" as const,
      };
    });
  };

  // Use vector index results if available
  if (vectorResults && vectorResults.length > 0) {
    return enrichResults(vectorResults);
  }

  // Fallback: inline cosine similarity (original O(n) approach)
  const stored = getStoredEmbeddings();
  if (stored.length === 0) return [];

  const scored = stored.map((record) => ({
    path: record.path,
    score: cosineSimilarity(queryEmbedding, record.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const unique = scored.filter((s) => {
    if (seen.has(s.path)) return false;
    seen.add(s.path);
    return true;
  });

  return enrichResults(unique);
}

// ── Hybrid search (FTS + semantic) ─────────────────────────────────

export async function hybridSearch(query: string, limit = 10): Promise<SemanticSearchResult[]> {

  // Run FTS and semantic in parallel
  const [ftsResults, semResults] = await Promise.all([
    Promise.resolve(searchArtifacts(query, limit * 2)),
    semanticSearch(query, limit * 2),
  ]);

  // Merge and score
  const scoreMap = new Map<string, { fts: number; semantic: number; title: string; type: string; group: string; snippet: string }>();

  // Normalize FTS ranks (they're negative — lower is better)
  const maxFtsRank = Math.max(...ftsResults.map((r) => Math.abs(r.rank)), 1);
  for (const r of ftsResults) {
    const ftsScore = 1 - (Math.abs(r.rank) / maxFtsRank); // Normalize to 0-1
    scoreMap.set(r.path, {
      fts: ftsScore,
      semantic: 0,
      title: r.title,
      type: r.type,
      group: r.group,
      snippet: r.snippet,
    });
  }

  for (const r of semResults) {
    const existing = scoreMap.get(r.path);
    if (existing) {
      existing.semantic = r.score;
    } else {
      scoreMap.set(r.path, {
        fts: 0,
        semantic: r.score,
        title: r.title,
        type: r.type,
        group: r.group,
        snippet: r.snippet,
      });
    }
  }

  // Hybrid score: weighted combination (FTS 0.4, semantic 0.6)
  const FTS_WEIGHT = 0.4;
  const SEMANTIC_WEIGHT = 0.6;

  const results = Array.from(scoreMap.entries())
    .map(([path, scores]) => {
      const hybridScore = (scores.fts * FTS_WEIGHT) + (scores.semantic * SEMANTIC_WEIGHT);
      const source = scores.fts > 0 && scores.semantic > 0 ? "hybrid"
        : scores.semantic > 0 ? "semantic"
        : "fts";

      return {
        path,
        title: scores.title,
        type: scores.type,
        group: scores.group,
        snippet: scores.snippet,
        score: Math.round(hybridScore * 1000) / 1000,
        source: source as "hybrid" | "semantic" | "fts",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}
