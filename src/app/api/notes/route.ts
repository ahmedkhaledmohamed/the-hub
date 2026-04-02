import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadConfig, getResolvedWorkspacePaths } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { content } = await req.json() as { content: string };

  if (!content?.trim()) {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const config = loadConfig();
  const paths = getResolvedWorkspacePaths(config);
  const notesDir = join(paths[0] || process.cwd(), "hub-notes");

  if (!existsSync(notesDir)) mkdirSync(notesDir, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const filename = `notes-${date}.md`;
  const filepath = join(notesDir, filename);

  const header = `# Quick Notes — ${date}\n\nCaptured from The Hub\n\n---\n\n`;
  const body = existsSync(filepath) ? "" : header;

  writeFileSync(filepath, body + content, { flag: existsSync(filepath) ? "w" : "w" });

  return NextResponse.json({ saved: true, path: filepath });
}
