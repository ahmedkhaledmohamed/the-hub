/**
 * API route deprecation — mark underused routes for removal.
 *
 * Adds X-Deprecated header to responses from deprecated routes,
 * with a message explaining what to use instead.
 *
 * Routes marked deprecated in v5 will be removed in v5.1.
 */

import { NextResponse } from "next/server";

// ── Types ──────────────────────────────────────────────────────────

export interface DeprecationInfo {
  route: string;
  since: string;
  removeIn: string;
  alternative: string;
  reason: string;
}

// ── Deprecated routes ─────────────────────────────────────────────

export const DEPRECATED_ROUTES: DeprecationInfo[] = [
  { route: "/api/federation", since: "v5.0", removeIn: "v5.1", alternative: "N/A — federation deferred", reason: "0 users linking Hubs" },
  { route: "/api/sharing", since: "v5.0", removeIn: "v5.1", alternative: "N/A — sharing deferred", reason: "No sharing adoption" },
  { route: "/api/contexts", since: "v5.0", removeIn: "v5.1", alternative: "Use hub.config.ts workspaces", reason: "Multi-context unused" },
  { route: "/api/marketplace", since: "v5.0", removeIn: "v5.1", alternative: "Use /api/plugins", reason: "0 community plugins" },
  { route: "/api/agent-memory", since: "v5.0", removeIn: "v5.1", alternative: "Use remember/recall MCP tools (with HUB_MCP_ALL_TOOLS=true)", reason: "No agent adoption" },
  { route: "/api/pipeline", since: "v5.0", removeIn: "v5.1", alternative: "Pipeline runs automatically on scan", reason: "Manual trigger unused" },
  { route: "/api/gaps", since: "v5.0", removeIn: "v5.1", alternative: "Use detect_gaps MCP tool", reason: "Low API usage" },
  { route: "/api/meeting-brief", since: "v5.0", removeIn: "v5.1", alternative: "Use meeting_brief MCP tool or /api/context", reason: "Duplicate functionality" },
];

// ── Helper ────────────────────────────────────────────────────────

/**
 * Add deprecation headers to a response.
 */
export function addDeprecationHeaders(response: NextResponse, info: DeprecationInfo): NextResponse {
  response.headers.set("X-Deprecated", "true");
  response.headers.set("X-Deprecated-Since", info.since);
  response.headers.set("X-Deprecated-Remove-In", info.removeIn);
  response.headers.set("X-Deprecated-Alternative", info.alternative);
  response.headers.set("X-Deprecated-Reason", info.reason);
  return response;
}

/**
 * Check if a route is deprecated.
 */
export function isRouteDeprecated(path: string): DeprecationInfo | null {
  return DEPRECATED_ROUTES.find((r) => path.startsWith(r.route)) || null;
}

/**
 * Get all deprecated routes.
 */
export function getDeprecatedRoutes(): DeprecationInfo[] {
  return DEPRECATED_ROUTES;
}

/**
 * Wrap a response with deprecation headers if the route is deprecated.
 */
export function wrapDeprecated(path: string, response: NextResponse): NextResponse {
  const info = isRouteDeprecated(path);
  if (info) return addDeprecationHeaders(response, info);
  return response;
}
