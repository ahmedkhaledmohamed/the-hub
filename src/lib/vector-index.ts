/**
 * In-memory vector index for fast similarity search.
 *
 * Loads embeddings from SQLite, pre-computes norms, and provides
 * O(n) but highly optimized cosine similarity search with
 * pre-filtering by path prefix for scoped searches.
 *
 * Future: replace with sqlite-vec native extension when stable.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface IndexedVector {
  path: string;
  chunkIndex: number;
  embedding: Float32Array;
  norm: number;
}

export interface VectorSearchResult {
  path: string;
  score: number;
  chunkIndex: number;
}

// ── Index ──────────────────────────────────────────────────────────

let indexedVectors: IndexedVector[] = [];
let indexBuiltAt = 0;
const INDEX_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Build or refresh the in-memory index from SQLite embeddings.
 */
export function buildIndex(embeddings: Array<{ path: string; chunkIndex: number; embedding: number[] }>): number {
  indexedVectors = embeddings.map((e) => {
    const arr = new Float32Array(e.embedding);
    return {
      path: e.path,
      chunkIndex: e.chunkIndex,
      embedding: arr,
      norm: vectorNorm(arr),
    };
  });
  indexBuiltAt = Date.now();
  return indexedVectors.length;
}

/**
 * Check if the index needs rebuilding.
 */
export function isIndexStale(): boolean {
  return Date.now() - indexBuiltAt > INDEX_TTL_MS;
}

export function getIndexSize(): number {
  return indexedVectors.length;
}

export function clearIndex(): void {
  indexedVectors = [];
  indexBuiltAt = 0;
}

// ── Vector math (optimized with Float32Array) ──────────────────────

export function vectorNorm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

export function cosineSimilarityFast(a: Float32Array, normA: number, b: Float32Array, normB: number): number {
  if (a.length !== b.length || normA === 0 || normB === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (normA * normB);
}

// ── Search ─────────────────────────────────────────────────────────

/**
 * Find the top-K most similar vectors to the query.
 * Uses pre-computed norms for ~2x faster cosine similarity.
 */
export function searchIndex(
  queryEmbedding: number[],
  options?: { topK?: number; pathPrefix?: string; minScore?: number },
): VectorSearchResult[] {
  const topK = options?.topK || 10;
  const minScore = options?.minScore || 0.0;
  const pathPrefix = options?.pathPrefix;

  const query = new Float32Array(queryEmbedding);
  const queryNorm = vectorNorm(query);
  if (queryNorm === 0) return [];

  // Filter by path prefix if specified
  const candidates = pathPrefix
    ? indexedVectors.filter((v) => v.path.startsWith(pathPrefix))
    : indexedVectors;

  // Compute similarities
  const scored: VectorSearchResult[] = [];
  for (const vec of candidates) {
    const score = cosineSimilarityFast(query, queryNorm, vec.embedding, vec.norm);
    if (score >= minScore) {
      scored.push({ path: vec.path, score, chunkIndex: vec.chunkIndex });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by path (keep highest scoring chunk)
  const seen = new Set<string>();
  const results: VectorSearchResult[] = [];
  for (const item of scored) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    results.push(item);
    if (results.length >= topK) break;
  }

  return results;
}

// ── Batch operations ───────────────────────────────────────────────

/**
 * Add vectors to the index without full rebuild.
 */
export function addToIndex(entries: Array<{ path: string; chunkIndex: number; embedding: number[] }>): void {
  for (const e of entries) {
    const arr = new Float32Array(e.embedding);
    indexedVectors.push({
      path: e.path,
      chunkIndex: e.chunkIndex,
      embedding: arr,
      norm: vectorNorm(arr),
    });
  }
}

/**
 * Remove vectors for a specific path.
 */
export function removeFromIndex(path: string): number {
  const before = indexedVectors.length;
  indexedVectors = indexedVectors.filter((v) => v.path !== path);
  return before - indexedVectors.length;
}

// ── Stats ──────────────────────────────────────────────────────────

export function getIndexStats(): {
  vectorCount: number;
  uniquePaths: number;
  dimensions: number;
  builtAt: number;
  stale: boolean;
} {
  const paths = new Set(indexedVectors.map((v) => v.path));
  return {
    vectorCount: indexedVectors.length,
    uniquePaths: paths.size,
    dimensions: indexedVectors.length > 0 ? indexedVectors[0].embedding.length : 0,
    builtAt: indexBuiltAt,
    stale: isIndexStale(),
  };
}
