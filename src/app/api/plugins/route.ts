import { NextResponse } from "next/server";
import {
  getLoadedPlugins,
  getPluginCount,
  initializePlugins,
  discoverPlugins,
  runOnRender,
} from "@/lib/plugin-registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/plugins — list loaded plugins and their panels
 */
export async function GET() {
  // Ensure plugins are initialized
  await initializePlugins();

  const plugins = getLoadedPlugins().map((p) => ({
    name: p.name,
    version: p.version,
    description: p.description,
    hooks: {
      onScan: !!p.onScan,
      onSearch: !!p.onSearch,
      onRender: !!p.onRender,
    },
  }));

  const panels = await runOnRender();

  return NextResponse.json({
    plugins,
    pluginCount: getPluginCount(),
    discovered: discoverPlugins(),
    panels,
  });
}
