import { NextRequest, NextResponse } from "next/server";
import { generateEmbeddings, getGenerationStatus, shouldAutoGenerate } from "@/lib/embedding-generator";

export const dynamic = "force-dynamic";

/**
 * GET /api/embeddings — generation status
 */
export async function GET() {
  const status = getGenerationStatus();
  return NextResponse.json({ ...status, shouldAutoGenerate: shouldAutoGenerate() });
}

/**
 * POST /api/embeddings
 * { action: "generate", maxDocs?, batchSize? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action === "generate") {
    const result = await generateEmbeddings({
      maxDocs: body.maxDocs as number | undefined,
      batchSize: body.batchSize as number | undefined,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be generate" }, { status: 400 });
}
