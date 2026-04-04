import { NextRequest, NextResponse } from "next/server";

/**
 * API authentication middleware.
 *
 * When HUB_API_KEYS is set, requires Bearer token for /api/* routes.
 * Non-API routes (pages, static assets) are always allowed.
 * The /api/auth/* routes are exempt (used for session token exchange).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Exempt auth endpoints themselves
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Check if auth is enabled
  const apiKeys = process.env.HUB_API_KEYS;
  if (!apiKeys) {
    return NextResponse.next(); // Auth disabled
  }

  const validKeys = apiKeys.split(",").map((k) => k.trim()).filter(Boolean);
  if (validKeys.length === 0) {
    return NextResponse.next(); // No keys configured
  }

  // Extract and validate token
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required. Use: Authorization: Bearer <api-key>" },
      { status: 401 },
    );
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return NextResponse.json(
      { error: "Invalid Authorization header format. Use: Bearer <api-key>" },
      { status: 401 },
    );
  }

  const token = parts[1];

  // Check against API keys
  if (validKeys.includes(token)) {
    return NextResponse.next();
  }

  // Check against session tokens (stored in a cookie for web UI)
  const sessionToken = request.cookies.get("hub-session")?.value;
  if (sessionToken && validKeys.includes(sessionToken)) {
    // Session cookie contains an API key — allow
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "Invalid API key" },
    { status: 401 },
  );
}

export const config = {
  matcher: "/api/:path*",
};
