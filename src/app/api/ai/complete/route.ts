import { NextRequest, NextResponse } from "next/server";
import { complete, stream, isAiConfigured, promptCacheKey } from "@/lib/ai-client";
import type { AiMessage } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    prompt?: string;
    messages?: AiMessage[];
    stream?: boolean;
    maxTokens?: number;
    cacheKey?: string;
    cacheTtl?: number;
  };

  if (!body.prompt && (!body.messages || body.messages.length === 0)) {
    return NextResponse.json({ error: "prompt or messages required" }, { status: 400 });
  }

  const messages: AiMessage[] = body.messages || [{ role: "user", content: body.prompt! }];

  // Streaming mode
  if (body.stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const chunks = stream({
            messages,
            maxTokens: body.maxTokens,
          });

          for await (const chunk of chunks) {
            const data = JSON.stringify(chunk);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            if (chunk.done) break;
          }
        } catch (err) {
          const errData = JSON.stringify({ content: "Stream error", done: true });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming mode
  const cacheKey = body.cacheKey || (body.prompt ? promptCacheKey(body.prompt) : undefined);

  const result = await complete({
    messages,
    maxTokens: body.maxTokens,
    cacheKey,
    cacheTtl: body.cacheTtl,
  });

  return NextResponse.json({
    content: result.content,
    model: result.model,
    cached: result.cached,
  });
}

export async function GET() {
  return NextResponse.json({
    configured: isAiConfigured(),
    model: process.env.AI_MODEL || "claude-sonnet-4-5",
  });
}
