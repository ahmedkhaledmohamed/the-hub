import { NextResponse } from "next/server";
import { loadFrameworkCatalog, invalidateFrameworkCache } from "@/lib/framework";

export const dynamic = "force-dynamic";

export async function GET() {
  invalidateFrameworkCache();
  const catalog = loadFrameworkCatalog();
  if (!catalog) {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(catalog);
}
