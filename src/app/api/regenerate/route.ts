import { NextResponse } from "next/server";
import { regenerate } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const manifest = regenerate();
    return NextResponse.json({
      status: "ok",
      artifacts: manifest.artifacts.length,
      generatedAt: manifest.generatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to regenerate", detail: String(error) },
      { status: 500 },
    );
  }
}
