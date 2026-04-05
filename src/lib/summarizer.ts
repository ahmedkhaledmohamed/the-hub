/**
 * AI summarization for Hub artifacts.
 *
 * Generates concise summaries using the shared AI client.
 * Summaries are cached in SQLite keyed by content hash — only
 * regenerated when the underlying content changes.
 */

import { getDb, contentHash } from "./db";
import { ask, isAiConfigured } from "./ai-client";

// ── Schema ─────────────────────────────────────────────────────────

function ensureSummaryTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS summaries (
      content_hash  TEXT PRIMARY KEY,
      summary       TEXT NOT NULL,
      model         TEXT NOT NULL,
      word_count    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Summary retrieval ──────────────────────────────────────────────

export function getCachedSummary(hash: string): string | null {
  try {
    ensureSummaryTable();
    const db = getDb();
    const row = db.prepare(
      "SELECT summary FROM summaries WHERE content_hash = ?"
    ).get(hash) as { summary: string } | undefined;
    return row?.summary ?? null;
  } catch {
    return null;
  }
}

export function setCachedSummary(hash: string, summary: string, model: string, wordCount: number): void {
  try {
    ensureSummaryTable();
    const db = getDb();
    db.prepare(`
      INSERT INTO summaries (content_hash, summary, model, word_count)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(content_hash) DO UPDATE SET
        summary = excluded.summary,
        model = excluded.model,
        word_count = excluded.word_count,
        created_at = datetime('now')
    `).run(hash, summary, model, wordCount);
  } catch (err) {
    try { const { reportError } = require("./error-reporter"); reportError("ai", err, { operation: "cache-summary" }); } catch { /* non-critical */ }
  }
}

// ── Word count helper ──────────────────────────────────────────────

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// ── Summarize a single artifact ────────────────────────────────────

const MIN_WORDS_FOR_SUMMARY = 500;

export async function summarizeContent(content: string): Promise<{ summary: string; cached: boolean } | null> {
  const words = wordCount(content);
  if (words < MIN_WORDS_FOR_SUMMARY) return null;

  const hash = contentHash(content);

  // Check cache first (works even without AI configured)
  const cached = getCachedSummary(hash);
  if (cached) return { summary: cached, cached: true };

  // Need AI to generate a new summary
  if (!isAiConfigured()) return null;

  // Generate summary
  const result = await ask(content.slice(0, 12000), {
    systemPrompt: "You are a concise document summarizer. Summarize the following document in exactly 2 sentences. Be specific about the key points, not generic. Do not use phrases like 'This document' — start with the actual subject matter.",
    maxTokens: 200,
  });

  if (result.model === "none") return null; // AI not available

  // Cache the summary
  setCachedSummary(hash, result.content, result.model, words);

  return { summary: result.content, cached: false };
}

// ── Summarize a group of artifacts ─────────────────────────────────

export async function summarizeGroup(
  artifacts: Array<{ title: string; content: string }>,
): Promise<{ summary: string; cached: boolean } | null> {
  if (!isAiConfigured()) return null;
  if (artifacts.length === 0) return null;

  // Build a combined context
  const combined = artifacts
    .map((a) => `## ${a.title}\n${a.content.slice(0, 3000)}`)
    .join("\n\n---\n\n");

  const hash = contentHash(combined);

  // Check cache
  const cached = getCachedSummary(hash);
  if (cached) return { summary: cached, cached: true };

  const prompt = `Below are ${artifacts.length} documents from the same group in a workspace. Provide a concise 3-4 sentence summary that captures:
1. What this group of documents covers overall
2. The key themes or decisions documented
3. Any notable patterns (e.g., most docs are planning docs, or technical specs)

${combined}`;

  const result = await ask(prompt, {
    systemPrompt: "You summarize collections of documents concisely. Be specific, not generic.",
    maxTokens: 300,
  });

  if (result.model === "none") return null;

  setCachedSummary(hash, result.content, result.model, wordCount(combined));

  return { summary: result.content, cached: false };
}

// ── Bulk summary lookup for manifests ──────────────────────────────

export function getBulkSummaries(contentHashes: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  try {
    ensureSummaryTable();
    const db = getDb();
    const stmt = db.prepare("SELECT content_hash, summary FROM summaries WHERE content_hash = ?");

    for (const [path, hash] of contentHashes) {
      const row = stmt.get(hash) as { content_hash: string; summary: string } | undefined;
      if (row) {
        result.set(path, row.summary);
      }
    }
  } catch {
    // Non-fatal
  }
  return result;
}
