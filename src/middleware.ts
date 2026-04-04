import { NextRequest, NextResponse } from "next/server";

/**
 * API middleware: authentication + rate limiting.
 *
 * Auth: When HUB_API_KEYS is set, requires Bearer token for /api/* routes.
 * Rate limiting: When HUB_RATE_LIMIT is set (or NODE_ENV=production),
 * limits requests per IP using a token bucket algorithm.
 */

// ── Rate limiter (Edge-compatible, in-memory) ──────────────────────

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function checkRate(ip: string): { allowed: boolean; remaining: number } {
  const limit = parseInt(process.env.HUB_RATE_LIMIT || "0", 10);
  if (limit <= 0) return { allowed: true, remaining: -1 }; // Disabled

  const burst = parseInt(process.env.HUB_RATE_BURST || "30", 10);
  const tokensPerMs = limit / 60_000;
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: burst, lastRefill: now };
    buckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * tokensPerMs);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  return { allowed: false, remaining: 0 };
}

// ── Middleware ──────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Exempt auth and docs endpoints
  if (pathname.startsWith("/api/auth/") || pathname === "/api/docs") {
    return NextResponse.next();
  }

  // ── Rate limiting ──
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const rateLimit = parseInt(process.env.HUB_RATE_LIMIT || "0", 10);

  if (rateLimit > 0) {
    const { allowed, remaining } = checkRate(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": "5",
            "X-RateLimit-Limit": String(rateLimit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    // Add rate limit headers to successful responses
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(rateLimit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));

    // Continue to auth check with this response
    return applyAuth(request, response);
  }

  // ── Authentication (no rate limiting) ──
  return applyAuth(request);
}

function applyAuth(request: NextRequest, existingResponse?: NextResponse): NextResponse {
  const apiKeys = process.env.HUB_API_KEYS;
  if (!apiKeys) {
    return existingResponse || NextResponse.next();
  }

  const validKeys = apiKeys.split(",").map((k) => k.trim()).filter(Boolean);
  if (validKeys.length === 0) {
    return existingResponse || NextResponse.next();
  }

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

  if (validKeys.includes(token)) {
    return existingResponse || NextResponse.next();
  }

  const sessionToken = request.cookies.get("hub-session")?.value;
  if (sessionToken && validKeys.includes(sessionToken)) {
    return existingResponse || NextResponse.next();
  }

  return NextResponse.json(
    { error: "Invalid API key" },
    { status: 401 },
  );
}

export const config = {
  matcher: "/api/:path*",
};
