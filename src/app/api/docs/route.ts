import { NextResponse } from "next/server";
import { generateOpenApiSpec } from "@/lib/openapi";

export const dynamic = "force-dynamic";

/**
 * GET /api/docs — OpenAPI 3.1 specification
 */
export async function GET() {
  const spec = generateOpenApiSpec();
  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
