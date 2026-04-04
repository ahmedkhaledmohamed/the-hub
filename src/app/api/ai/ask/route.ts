import { NextRequest, NextResponse } from "next/server";
import { askWorkspace } from "@/lib/rag";
import { isAiConfigured } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { question } = await req.json() as { question?: string };

  if (!question?.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const result = await askWorkspace(question.trim());

  return NextResponse.json({
    question: question.trim(),
    answer: result.answer,
    sources: result.sources,
    model: result.model,
    cached: result.cached,
  });
}

export async function GET() {
  return NextResponse.json({
    configured: isAiConfigured(),
    description: "POST a { question } to ask about your workspace. Returns { answer, sources }.",
  });
}
