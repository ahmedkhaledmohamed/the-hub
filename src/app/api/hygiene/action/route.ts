import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { dirname, basename, join } from "path";
import { resolveFullPath, invalidateHygieneCache } from "@/lib/hygiene-analyzer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { action, path: artifactPath } = await req.json() as {
    action: "archive" | "delete";
    path: string;
  };

  if (!artifactPath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const fullPath = resolveFullPath(artifactPath);
  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    if (action === "delete") {
      unlinkSync(fullPath);
      invalidateHygieneCache();
      return NextResponse.json({ deleted: true, path: artifactPath });
    }

    if (action === "archive") {
      const dir = dirname(fullPath);
      const archiveDir = join(dir, "_archive");
      if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
      const dest = join(archiveDir, basename(fullPath));
      renameSync(fullPath, dest);
      invalidateHygieneCache();
      return NextResponse.json({ archived: true, from: artifactPath, to: dest });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
