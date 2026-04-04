import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentVersion, getAppliedMigrations, getLatestVersion, getPendingMigrations, runMigrations } from "@/lib/migrations";

export const dynamic = "force-dynamic";

/**
 * GET /api/migrations — current schema version, applied + pending migrations
 */
export async function GET() {
  const db = getDb();
  return NextResponse.json({
    currentVersion: getCurrentVersion(db),
    latestVersion: getLatestVersion(),
    upToDate: getCurrentVersion(db) >= getLatestVersion(),
    applied: getAppliedMigrations(db),
    pending: getPendingMigrations(db).map((m) => ({ version: m.version, name: m.name })),
  });
}
