import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolveFullPath } from "@/lib/hygiene-analyzer";

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
    } catch {
      return { path: p, content: "(could not read file)" };
    }
  });

  const prompt = buildPrompt(contents, findingType);

  // Try Taskforce / AI Gateway first, fall back to a static analysis summary
  const aiReview = await callAI(prompt);

  return NextResponse.json({ review: aiReview });
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

async function callAI(prompt: string): Promise<string> {
  // Attempt AI Gateway call if configured
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_KEY;

  if (gatewayUrl && apiKey) {
    try {
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.content?.[0]?.text || data.choices?.[0]?.message?.content || "No response from AI.";
      }
    } catch {
      // Fall through to static analysis
    }
  }

  // Fallback: basic heuristic summary when no AI is available
  return `**AI review unavailable** — no AI Gateway configured.\n\nTo enable AI-powered review, set \`AI_GATEWAY_URL\` and \`AI_GATEWAY_KEY\` environment variables, or deploy a review agent on [Taskforce](https://taskforce.spotify.net/).\n\nIn the meantime, open both files side-by-side in Cursor and compare manually.`;
}
