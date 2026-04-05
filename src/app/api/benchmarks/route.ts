import { NextRequest, NextResponse } from "next/server";
import { runBenchmarkSuite, formatBenchmarkReport } from "@/lib/benchmarks";

export const dynamic = "force-dynamic";

/**
 * GET /api/benchmarks              — run benchmark suite
 * GET /api/benchmarks?format=text  — text report
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  const suite = runBenchmarkSuite();

  if (format === "text") {
    return new Response(formatBenchmarkReport(suite), { headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json(suite);
}
