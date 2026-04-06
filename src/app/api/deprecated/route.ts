import { NextResponse } from "next/server";
import { getDeprecatedRoutes } from "@/lib/deprecation";

export const dynamic = "force-dynamic";

/**
 * GET /api/deprecated — list all deprecated routes
 */
export async function GET() {
  const routes = getDeprecatedRoutes();
  return NextResponse.json({
    deprecatedCount: routes.length,
    routes,
    message: "These routes will be removed in v5.1. Check X-Deprecated headers on responses.",
  });
}
