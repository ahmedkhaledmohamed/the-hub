/**
 * Embedding auto-generation — generate embeddings on first scan.
 *
 * When AI is configured and the embeddings table is empty,
 * automatically generates embeddings for key documents to enable
 * semantic search from the start.
 *
 * Runs in batches to avoid overwhelming the AI provider.
 * Skips docs that already have embeddings (idempotent).
 */

import { getDb, getArtifactContent, contentHash } from "./db";
import { generateEmbedding, storeEmbedding, hasEmbedding, getEmbeddingCount } from "./embeddings";
import { isAiConfigured, ensureAiConfigured } from "./ai-client";

// ── Types ──────────────────────────────────────────────────────────

export interface GenerationResult {
  generated: number;
  skipped: number;
  failed: number;
  total: number;
  durationMs: number;
}

export interface GenerationStatus {
  running: boolean;
  lastResult: GenerationResult | null;
  embeddingCount: number;
  aiConfigured: boolean;
}

// ── State ─────────────────────────────────────────────────────────

let isRunning = false;
let lastResult: GenerationResult | null = null;

// ── Generation ────────────────────────────────────────────────────

/**
 * Generate embeddings for artifacts that don't have them yet.
 * Runs in batches of `batchSize` with delays between batches.
 */
export async function generateEmbeddings(options?: {
  maxDocs?: number;
  batchSize?: number;
  delayMs?: number;
  types?: string[];
}): Promise<GenerationResult> {
  if (isRunning) return { generated: 0, skipped: 0, failed: 0, total: 0, durationMs: 0 };

  const maxDocs = options?.maxDocs || 100;
  const batchSize = options?.batchSize || 5;
  const delayMs = options?.delayMs || 500;
  const allowedTypes = new Set(options?.types || ["md", "html", "txt"]);

  isRunning = true;
  const start = Date.now();
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Check if AI is configured
    const aiReady = await ensureAiConfigured();
    if (!aiReady) {
      isRunning = false;
      return { generated: 0, skipped: 0, failed: 0, total: 0, durationMs: Date.now() - start };
    }

    // Get artifacts that need embeddings
    const db = getDb();
    const artifacts = db.prepare(
      "SELECT path, type FROM artifacts ORDER BY stale_days ASC LIMIT ?",
    ).all(maxDocs * 2) as Array<{ path: string; type: string }>;

    const candidates = artifacts.filter((a) => allowedTypes.has(a.type));
    const total = Math.min(candidates.length, maxDocs);

    // Process in batches
    for (let i = 0; i < total; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);

      for (const artifact of batch) {
        const content = getArtifactContent(artifact.path);
        if (!content || content.length < 50) {
          skipped++;
          continue;
        }

        const hash = contentHash(content);
        if (hasEmbedding(hash)) {
          skipped++;
          continue;
        }

        try {
          const embedding = await generateEmbedding(content.slice(0, 8000));
          if (embedding) {
            storeEmbedding(artifact.path, 0, hash, embedding, "auto");
            generated++;
          } else {
            skipped++;
          }
        } catch {
          failed++;
        }
      }

      // Delay between batches to avoid rate limiting
      if (i + batchSize < total) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const result: GenerationResult = {
      generated,
      skipped,
      failed,
      total,
      durationMs: Date.now() - start,
    };

    lastResult = result;

    // Log via structured logger
    try {
      const { hubLog } = require("./logger");
      hubLog("info", "ai", "Embedding auto-generation complete", {
        generated, skipped, failed, total, durationMs: result.durationMs,
      });
    } catch { /* non-critical */ }

    return result;
  } finally {
    isRunning = false;
  }
}

/**
 * Check if auto-generation should run (embeddings table empty + AI configured).
 */
export function shouldAutoGenerate(): boolean {
  if (process.env.AI_PROVIDER === "none") return false;
  return getEmbeddingCount() === 0 && isAiConfigured();
}

/**
 * Get current generation status.
 */
export function getGenerationStatus(): GenerationStatus {
  return {
    running: isRunning,
    lastResult,
    embeddingCount: getEmbeddingCount(),
    aiConfigured: isAiConfigured(),
  };
}

/**
 * Trigger auto-generation if conditions are met (empty embeddings + AI ready).
 * Designed to be called after first scan.
 */
export async function autoGenerateIfNeeded(): Promise<GenerationResult | null> {
  if (!shouldAutoGenerate()) return null;

  try {
    const { hubLog } = require("./logger");
    hubLog("info", "ai", "Starting embedding auto-generation (first scan detected)");
  } catch { /* non-critical */ }

  return generateEmbeddings({ maxDocs: 50 }); // Start with top 50 docs
}
