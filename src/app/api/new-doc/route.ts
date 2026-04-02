import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { loadConfig, getResolvedWorkspacePaths } from "@/lib/config";

export const dynamic = "force-dynamic";

const DEFAULT_TEMPLATES = [
  { id: "blank", label: "Blank", content: "# {{title}}\n\n" },
  { id: "status", label: "Status Update", content: "# Status Update — {{date}}\n\n## Progress\n\n## Blockers\n\n## Next\n" },
  { id: "meeting", label: "Meeting Notes", content: "# {{title}}\n\nDate: {{date}}\nAttendees:\n\n## Agenda\n\n## Notes\n\n## Action Items\n" },
  { id: "prd", label: "PRD Outline", content: "# {{title}}\n\n## Problem\n\n## Goals\n\n## Non-Goals\n\n## Proposal\n\n## Metrics\n\n## Open Questions\n" },
];

export async function GET() {
  const config = loadConfig();
  const templates = config.templates || DEFAULT_TEMPLATES;
  const workspaces = config.workspaces.map((w, i) => ({
    label: w.label,
    path: getResolvedWorkspacePaths(config)[i],
  }));
  return NextResponse.json({ templates, workspaces });
}

export async function POST(req: NextRequest) {
  const { workspace, folder, filename, templateId } = await req.json() as {
    workspace: string;
    folder: string;
    filename: string;
    templateId: string;
  };

  if (!filename?.trim()) {
    return NextResponse.json({ error: "Filename required" }, { status: 400 });
  }

  const config = loadConfig();
  const workspacePaths = getResolvedWorkspacePaths(config);
  const wsIndex = config.workspaces.findIndex((w) => w.label === workspace);
  const wsPath = wsIndex >= 0 ? workspacePaths[wsIndex] : workspacePaths[0];

  const templates = config.templates || DEFAULT_TEMPLATES;
  const template = templates.find((t) => t.id === templateId) || templates[0];

  const safeName = filename.endsWith(".md") ? filename : `${filename}.md`;
  const title = safeName.replace(/\.md$/, "").replace(/[-_]/g, " ");
  const date = new Date().toISOString().split("T")[0];

  const content = template.content
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{date\}\}/g, date);

  const dir = folder ? join(wsPath, folder) : wsPath;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filepath = join(dir, safeName);
  if (existsSync(filepath)) {
    return NextResponse.json({ error: "File already exists" }, { status: 409 });
  }

  writeFileSync(filepath, content, "utf-8");

  const relativePath = filepath.replace(wsPath + "/", "");
  const workspaceLabel = config.workspaces[wsIndex >= 0 ? wsIndex : 0].label;

  return NextResponse.json({
    created: true,
    path: filepath,
    relativePath: `${workspaceLabel}/${relativePath}`,
    cursorUri: `cursor://file${filepath}`,
  });
}
