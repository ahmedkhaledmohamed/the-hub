/**
 * API authentication for The Hub.
 *
 * Optional API key authentication. When HUB_API_KEYS is set,
 * all API requests require a valid Bearer token.
 *
 * Configuration:
 *   HUB_API_KEYS — Comma-separated list of valid API keys
 *
 * The web UI gets a session token via /api/auth/session.
 * When auth is disabled (no HUB_API_KEYS), everything is open.
 */

import { createHash, randomBytes } from "crypto";

// ── Configuration ──────────────────────────────────────────────────

export function getApiKeys(): string[] {
  const raw = process.env.HUB_API_KEYS;
  if (!raw) return [];
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

export function isAuthEnabled(): boolean {
  return getApiKeys().length > 0;
}

// ── Validation ─────────────────────────────────────────────────────

export function validateApiKey(key: string): boolean {
  const validKeys = getApiKeys();
  if (validKeys.length === 0) return true; // Auth disabled
  return validKeys.includes(key);
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

// ── Session tokens (for web UI) ────────────────────────────────────

const sessionTokens = new Set<string>();

export function generateSessionToken(): string {
  const token = randomBytes(32).toString("hex");
  sessionTokens.add(token);
  return token;
}

export function validateSessionToken(token: string): boolean {
  return sessionTokens.has(token);
}

export function revokeSessionToken(token: string): void {
  sessionTokens.delete(token);
}

// ── Request authentication ─────────────────────────────────────────

export function authenticateRequest(authHeader: string | null): {
  authenticated: boolean;
  reason?: string;
} {
  if (!isAuthEnabled()) {
    return { authenticated: true };
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    return { authenticated: false, reason: "Missing Authorization header. Use: Bearer <api-key>" };
  }

  // Check API key
  if (validateApiKey(token)) {
    return { authenticated: true };
  }

  // Check session token
  if (validateSessionToken(token)) {
    return { authenticated: true };
  }

  return { authenticated: false, reason: "Invalid API key or session token" };
}
