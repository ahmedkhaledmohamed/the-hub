import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { getDb, getArtifactCount } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/backup                — backup info (size, artifact count, tables)
 * GET /api/backup?download=true  — download SQLite database as a file
 */
export async function GET(req: NextRequest) {
  const download = req.nextUrl.searchParams.get("download");
  const dbPath = join(process.cwd(), ".hub-data", "hub.db");

  if (download === "true") {
    if (!existsSync(dbPath)) {
      return NextResponse.json({ error: "Database file not found" }, { status: 404 });
    }

    // Checkpoint WAL to ensure all data is in the main DB file
    try {
      const db = getDb();
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch { /* non-critical */ }

    const buffer = readFileSync(dbPath);
    const filename = `hub-backup-${new Date().toISOString().slice(0, 10)}.db`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  }

  // Info mode
  let dbSize = 0;
  if (existsSync(dbPath)) {
    dbSize = statSync(dbPath).size;
  }

  let tableCount = 0;
  let rowCount = 0;
  try {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as Array<{ name: string }>;
    tableCount = tables.length;

    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number };
        rowCount += row.count;
      } catch { /* some tables may have issues */ }
    }
  } catch { /* db not ready */ }

  return NextResponse.json({
    dbPath,
    dbSize,
    dbSizeFormatted: formatSize(dbSize),
    artifactCount: getArtifactCount(),
    tableCount,
    totalRows: rowCount,
    downloadUrl: "/api/backup?download=true",
    generatedAt: new Date().toISOString(),
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
