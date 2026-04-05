import { NextRequest, NextResponse } from "next/server";
import { runQueryAudit, formatAuditReport, ensureRequiredIndexes } from "@/lib/query-audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/query-audit              — run query plan audit
 * GET /api/query-audit?format=text  — text report
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");

  // Ensure indexes exist before auditing
  ensureRequiredIndexes();

  const report = runQueryAudit();

  if (format === "text") {
    return new Response(formatAuditReport(report), { headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json(report);
}
