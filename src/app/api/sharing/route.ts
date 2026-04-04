import { NextRequest, NextResponse } from "next/server";
import {
  isSharingEnabled,
  getSharingConfig,
  getUserRole,
  getUserName,
  getSharedUsers,
  getRecentUserActivity,
  trackUserActivity,
} from "@/lib/sharing";
import { extractBearerToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/sharing — sharing status, current user role, shared users
 */
export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  const role = getUserRole(token);
  const name = getUserName(token);

  return NextResponse.json({
    enabled: isSharingEnabled(),
    mode: getSharingConfig()?.mode || null,
    currentUser: { name, role },
    sharedUsers: getSharedUsers(),
    recentActivity: getRecentUserActivity(10),
  });
}

/**
 * POST /api/sharing — track a user action
 * Body: { action, path? }
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  const role = getUserRole(token);
  const name = getUserName(token);

  const { action, path } = await req.json() as { action?: string; path?: string };
  if (!action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  trackUserActivity(name, role, action, path);
  return NextResponse.json({ tracked: true, user: name, action });
}
