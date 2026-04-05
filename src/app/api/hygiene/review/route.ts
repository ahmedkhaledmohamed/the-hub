import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolveFullPath } from "@/lib/hygiene-analyzer";
import { ask, promptCacheKey } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { paths, findingType } = await req.json() as {
    paths: string[];
    findingType: string;
  };

  if (!paths || paths.length < 1) {
    return NextResponse.json({ error: "paths required" }, { status: 400 });
  }

  const contents = paths.map((p) => {
    try {
      const full = resolveFullPath(p);
      const text = readFileSync(full, "utf8");
      return { path: p, content: text.slice(0, 8000) };
    } catch (err) {
      try { const { reportError } = require("@/lib/error-reporter"); reportError("api", err, { operation: "hygiene-review-read", path: p }); } catch { /* non-critical */ }
      return { path: p, content: "(could not read file)" };
    }
  });

  const prompt = buildPrompt(contents, findingType);
  const result = await ask(prompt, {
    cacheKey: promptCacheKey(prompt),
    cacheTtl: 3600,
    maxTokens: 1024,
  });

  return NextResponse.json({ review: result.content, cached: result.cached });
}

function buildPrompt(
  files: { path: string; content: string }[],
  findingType: string,
): string {
  const fileBlocks = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  return `You are reviewing ${files.length} files flagged as "${findingType}" in a document workspace.

${fileBlocks}

Analyze these files and provide:
1. **Overlap**: What content is shared vs unique to each file?
2. **Currency**: Which file appears more current or complete?
3. **Recommendation**: Should these be merged, should one be deleted, or should both be kept? Be specific about what to do.

Keep your response concise (under 300 words). Use markdown formatting.`;
}
