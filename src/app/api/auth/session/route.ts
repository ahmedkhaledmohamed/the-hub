import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, generateSessionToken, getApiKeys } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session — check auth status
 * POST /api/auth/session — exchange an API key for a session token
 */

export async function GET() {
  return NextResponse.json({
    authEnabled: isAuthEnabled(),
    keyCount: getApiKeys().length,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      authenticated: true,
      message: "Auth is disabled — no keys required",
    });
  }

  const { apiKey } = await req.json() as { apiKey?: string };

  if (!apiKey) {
    return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  }

  const validKeys = getApiKeys();
  if (!validKeys.includes(apiKey)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Generate a session token
  const sessionToken = generateSessionToken();

  const response = NextResponse.json({
    authenticated: true,
    sessionToken,
  });

  // Set as httpOnly cookie for web UI
  response.cookies.set("hub-session", sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400 * 7, // 7 days
  });

  return response;
}
