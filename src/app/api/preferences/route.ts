import { NextRequest, NextResponse } from "next/server";
import { readPreferences, writePreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readPreferences());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const current = readPreferences();
  const updated = { ...current, ...body };
  writePreferences(updated);
  return NextResponse.json(updated);
}
