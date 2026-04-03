import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { resolveFullPath } from "@/lib/hygiene-analyzer";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "claude-sonnet-4-5";

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
          model: process.env.AI_MODEL || DEFAULT_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || data.content?.[0]?.text || "No response from AI.";
      }

      const errText = await res.text().catch(() => "");
      console.error(`[hygiene/review] AI Gateway returned ${res.status}: ${errText}`);
    } catch (err) {
      console.error("[hygiene/review] AI Gateway error:", err);
    }
  }

  return `**AI review unavailable** — no \`AI_GATEWAY_URL\` found in environment.\n\nTo enable:\n1. Set \`AI_GATEWAY_URL\` to any OpenAI-compatible chat completions endpoint\n2. Set \`AI_GATEWAY_KEY\` to your API key\n3. Optionally set \`AI_MODEL\` (defaults to \`${DEFAULT_MODEL}\`)\n4. Add these to \`.env.local\` and restart the hub`;
}
