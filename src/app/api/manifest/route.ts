import { NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manifest = getManifest();
    return NextResponse.json(manifest);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate manifest", detail: String(error) },
      { status: 500 },
    );
  }
}
