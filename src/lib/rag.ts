/**
 * RAG (Retrieval-Augmented Generation) pipeline for workspace Q&A.
 *
 * Pipeline: question → search → top-K chunks → prompt → LLM → answer with citations
 */

import { searchArtifacts, getArtifactContent } from "./db";
import { complete, isAiConfigured } from "./ai-client";
import type { AiMessage } from "./ai-client";

// ── Types ──────────────────────────────────────────────────────────

export interface RagSource {
  path: string;
  title: string;
  snippet: string;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  model: string;
  cached: boolean;
}

// ── Pipeline ───────────────────────────────────────────────────────

const TOP_K = 5;
const MAX_CONTEXT_CHARS = 12000;

export async function askWorkspace(question: string): Promise<RagAnswer> {
  if (!isAiConfigured()) {
    return {
      answer: "**AI not configured.** Set `AI_GATEWAY_URL` and `AI_GATEWAY_KEY` in `.env.local` to enable workspace Q&A.",
      sources: [],
      model: "none",
      cached: false,
    };
  }

  // Step 1: Retrieve relevant artifacts via FTS
  const searchResults = searchArtifacts(question, TOP_K * 2);

  if (searchResults.length === 0) {
    return {
      answer: "I couldn't find any relevant documents in your workspace for this question. Try rephrasing or check that your workspaces are configured.",
      sources: [],
      model: "none",
      cached: false,
    };
  }

  // Step 2: Build context from top-K results
  const sources: RagSource[] = [];
  const contextChunks: string[] = [];
  let totalChars = 0;

  for (const result of searchResults) {
    if (sources.length >= TOP_K) break;
    if (totalChars >= MAX_CONTEXT_CHARS) break;

    const content = getArtifactContent(result.path);
    if (!content) continue;

    const truncated = content.slice(0, MAX_CONTEXT_CHARS / TOP_K);
    contextChunks.push(`### Source: ${result.title} (${result.path})\n\n${truncated}`);
    totalChars += truncated.length;

    sources.push({
      path: result.path,
      title: result.title,
      snippet: result.snippet?.replace(/<\/?mark>/g, "") || "",
    });
  }

  if (sources.length === 0) {
    return {
      answer: "Found matching documents but couldn't read their content.",
      sources: [],
      model: "none",
      cached: false,
    };
  }

  // Step 3: Construct RAG prompt
  const context = contextChunks.join("\n\n---\n\n");

  const messages: AiMessage[] = [
    {
      role: "system",
      content: `You are a helpful assistant answering questions about a user's workspace documents.

Rules:
- Answer based ONLY on the provided source documents
- If the sources don't contain enough information, say so honestly
- Reference specific sources by their title when making claims
- Keep answers concise (2-4 paragraphs max)
- Use markdown formatting for readability
- At the end of your answer, list the sources you referenced as: **Sources:** followed by the titles`,
    },
    {
      role: "user",
      content: `Here are the relevant documents from my workspace:\n\n${context}\n\n---\n\nQuestion: ${question}`,
    },
  ];

  // Step 4: Generate answer
  const result = await complete({
    messages,
    maxTokens: 1024,
    temperature: 0.2,
  });

  return {
    answer: result.content,
    sources,
    model: result.model,
    cached: result.cached,
  };
}

/**
 * Build a RAG context string from search results (useful for MCP tools).
 */
export function buildRagContext(
  searchResults: Array<{ path: string; title: string }>,
  maxChars = MAX_CONTEXT_CHARS,
): { context: string; sources: RagSource[] } {
  const sources: RagSource[] = [];
  const chunks: string[] = [];
  let totalChars = 0;

  for (const result of searchResults) {
    if (sources.length >= TOP_K) break;
    if (totalChars >= maxChars) break;

    const content = getArtifactContent(result.path);
    if (!content) continue;

    const truncated = content.slice(0, maxChars / TOP_K);
    chunks.push(`### ${result.title} (${result.path})\n\n${truncated}`);
    totalChars += truncated.length;

    sources.push({
      path: result.path,
      title: result.title,
      snippet: content.slice(0, 200),
    });
  }

  return {
    context: chunks.join("\n\n---\n\n"),
    sources,
  };
}
