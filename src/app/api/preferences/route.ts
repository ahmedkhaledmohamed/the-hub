import { NextRequest, NextResponse } from "next/server";
import { readPreferences, writePreferences } from "@/lib/config";

export const dynamic = "force-dynamic";

function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 8) return key ? "****" : "";
  return key.slice(0, 5) + "..." + key.slice(-4);
}

export async function GET() {
  const prefs = readPreferences();
  // Mask API keys in response — full keys stay in preferences.json only
  return NextResponse.json({
    ...prefs,
    anthropicApiKey: prefs.anthropicApiKey ? maskApiKey(prefs.anthropicApiKey) : undefined,
    openaiApiKey: prefs.openaiApiKey ? maskApiKey(prefs.openaiApiKey) : undefined,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const current = readPreferences();

  // Don't overwrite keys with masked values from GET
  if (body.anthropicApiKey && body.anthropicApiKey.includes("...")) {
    delete body.anthropicApiKey;
  }
  if (body.openaiApiKey && body.openaiApiKey.includes("...")) {
    delete body.openaiApiKey;
  }

  const updated = { ...current, ...body };
  writePreferences(updated);
  return NextResponse.json({ ...updated, anthropicApiKey: maskApiKey(updated.anthropicApiKey), openaiApiKey: maskApiKey(updated.openaiApiKey) });
}
