import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { loadConfig, getResolvedWorkspacePaths } from "@/lib/config";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

function resolveArtifactPath(artifactPath: string, workspacePaths: string[]): string | null {
  for (const ws of workspacePaths) {
    const full = join(ws, artifactPath);
    if (existsSync(full)) return full;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { paths } = await req.json() as { paths: string[] };

  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: "No paths provided" }, { status: 400 });
  }

  const config = loadConfig();
  const workspacePaths = getResolvedWorkspacePaths(config);
  const manifest = getManifest();
  const artifactMap = new Map(manifest.artifacts.map((a) => [a.path, a]));

  const sections: string[] = [];

  sections.push("# Context Package");
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push(`Files: ${paths.length}`);
  sections.push("");

  for (const p of paths) {
    const artifact = artifactMap.get(p);
    const fullPath = resolveArtifactPath(p, workspacePaths);

    sections.push("---");
    sections.push(`## ${artifact?.title || p}`);
    sections.push(`- Path: \`${p}\``);
    if (artifact) {
      sections.push(`- Type: ${artifact.type}`);
      sections.push(`- Modified: ${artifact.modifiedAt}`);
      sections.push(`- Stale days: ${artifact.staleDays}`);
    }
    sections.push("");

    if (fullPath) {
      const ext = extname(fullPath).toLowerCase();
      try {
        const content = readFileSync(fullPath, "utf-8");
        const lang = ext === ".md" ? "markdown" : ext === ".html" ? "html" : ext.replace(".", "");
        sections.push("```" + lang);
        sections.push(content);
        sections.push("```");
      } catch {
        sections.push("*Could not read file*");
      }
    } else {
      sections.push("*File not found on disk*");
    }
    sections.push("");
  }

  const compiled = sections.join("\n");

  return NextResponse.json({ compiled, fileCount: paths.length });
}
