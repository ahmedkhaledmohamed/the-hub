import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolveFullPath } from "@/lib/hygiene-analyzer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { paths } = await req.json() as { paths: string[] };

  if (!paths?.length) {
    return NextResponse.json({ error: "paths required" }, { status: 400 });
  }

  const fullPaths = paths
    .map((p) => resolveFullPath(p))
    .filter((p) => existsSync(p));

  if (fullPaths.length === 0) {
    return NextResponse.json({ error: "No valid files found" }, { status: 404 });
  }

  try {
    const child = spawn("cursor", fullPaths, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return NextResponse.json({ opened: fullPaths.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
