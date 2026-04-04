import { NextRequest, NextResponse } from "next/server";
import {
  getMarketplacePlugins,
  searchMarketplace,
  installPlugin,
  uninstallPlugin,
  getInstalledPlugins,
} from "@/lib/marketplace";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace              — list all plugins
 * GET /api/marketplace?q=<query>    — search plugins
 * GET /api/marketplace?installed=true — installed only
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  const installedOnly = req.nextUrl.searchParams.get("installed") === "true";

  if (query) {
    return NextResponse.json({ plugins: searchMarketplace(query), query });
  }

  if (installedOnly) {
    const installed = getInstalledPlugins();
    return NextResponse.json({ installed, count: installed.length });
  }

  return NextResponse.json({
    plugins: getMarketplacePlugins(),
    installedCount: getInstalledPlugins().length,
  });
}

/**
 * POST /api/marketplace — install or uninstall
 * Body: { action: "install", name: "github" }
 * Body: { action: "uninstall", name: "my-plugin" }
 */
export async function POST(req: NextRequest) {
  const { action, name } = await req.json() as { action: string; name: string };

  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  if (action === "install") {
    const result = installPlugin(name);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  if (action === "uninstall") {
    const result = uninstallPlugin(name);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  return NextResponse.json({ error: "action must be 'install' or 'uninstall'" }, { status: 400 });
}
