import { NextRequest, NextResponse } from "next/server";
import {
  isSSOEnabled,
  isSSOConfigValid,
  getSSOConfig,
  buildSSORedirectUrl,
  parseAssertion,
  isAssertionValid,
  createSSOSession,
  validateSSOSession,
  revokeSSOSession,
  getActiveSessions,
  cleanupExpiredSessions,
  generateSPMetadata,
} from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * GET /api/sso                — SSO status and configuration
 * GET /api/sso?action=login   — initiate SSO login (redirect URL)
 * GET /api/sso?action=metadata — SP metadata XML
 * GET /api/sso?action=sessions — list active sessions
 * GET /api/sso?token=<token>  — validate session
 */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const token = req.nextUrl.searchParams.get("token");

  if (action === "login") {
    if (!isSSOEnabled()) return NextResponse.json({ error: "SSO not enabled" }, { status: 400 });
    const validation = isSSOConfigValid();
    if (!validation.valid) return NextResponse.json({ error: "SSO misconfigured", missing: validation.missing }, { status: 500 });
    const relayState = req.nextUrl.searchParams.get("relayState") || undefined;
    const redirectUrl = buildSSORedirectUrl(relayState);
    return NextResponse.json({ redirectUrl });
  }

  if (action === "metadata") {
    return new Response(generateSPMetadata(), {
      headers: { "Content-Type": "application/xml" },
    });
  }

  if (action === "sessions") {
    const sessions = getActiveSessions();
    // Redact tokens in the listing
    return NextResponse.json({
      sessions: sessions.map((s) => ({ ...s, token: s.token.slice(0, 8) + "..." })),
      count: sessions.length,
    });
  }

  if (token) {
    const session = validateSSOSession(token);
    if (!session) return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    return NextResponse.json({ valid: true, session: { ...session, token: session.token.slice(0, 8) + "..." } });
  }

  const config = getSSOConfig();
  return NextResponse.json({
    enabled: config.enabled,
    configured: isSSOConfigValid().valid,
    entityId: config.entityId,
    idpIssuer: config.idpIssuer,
    sessionTtlSeconds: config.sessionTtlSeconds,
  });
}

/**
 * POST /api/sso
 * { action: "callback", SAMLResponse }  — handle IdP callback
 * { action: "logout", token }           — revoke session
 * { action: "cleanup" }                 — remove expired sessions
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "callback") {
    if (!isSSOEnabled()) return NextResponse.json({ error: "SSO not enabled" }, { status: 400 });
    const samlResponse = body.SAMLResponse as string;
    if (!samlResponse) return NextResponse.json({ error: "SAMLResponse required" }, { status: 400 });

    const assertion = parseAssertion(samlResponse);
    if (!assertion) return NextResponse.json({ error: "Invalid SAML response" }, { status: 400 });

    const validity = isAssertionValid(assertion);
    if (!validity.valid) return NextResponse.json({ error: validity.reason }, { status: 401 });

    const session = createSSOSession(assertion);
    return NextResponse.json({
      token: session.token,
      user: {
        email: session.email,
        displayName: session.displayName,
        role: session.role,
        groups: session.groups,
      },
      expiresAt: session.expiresAt,
    });
  }

  if (action === "logout") {
    const { token } = body as { token?: string };
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
    const revoked = revokeSSOSession(token);
    return NextResponse.json({ revoked });
  }

  if (action === "cleanup") {
    const removed = cleanupExpiredSessions();
    return NextResponse.json({ removed });
  }

  return NextResponse.json({ error: "action must be callback, logout, or cleanup" }, { status: 400 });
}
