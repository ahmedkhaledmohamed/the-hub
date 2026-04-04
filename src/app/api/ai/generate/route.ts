import { NextRequest, NextResponse } from "next/server";
import { generate, getTemplates } from "@/lib/generator";
import type { GenerateTemplate } from "@/lib/generator";
import { isAiConfigured } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    template?: GenerateTemplate;
    groupId?: string;
    artifactPaths?: string[];
    customPrompt?: string;
  };

  if (!body.template) {
    return NextResponse.json({ error: "template is required" }, { status: 400 });
  }

  try {
    const result = await generate({
      template: body.template,
      groupId: body.groupId,
      artifactPaths: body.artifactPaths,
      customPrompt: body.customPrompt,
    });

    return NextResponse.json({
      content: result.content,
      template: result.template,
      model: result.model,
      sourcePaths: result.sourcePaths,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Generation failed",
    }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isAiConfigured(),
    templates: getTemplates(),
  });
}
