import { NextRequest, NextResponse } from "next/server";
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  pruneNotifications,
} from "@/lib/notifications";
import type { NotificationType } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?recipient=<name>            — get notifications
 * GET /api/notifications?recipient=<name>&unread=true — unread only
 * GET /api/notifications?recipient=<name>&count=true  — unread count
 */
export async function GET(req: NextRequest) {
  const recipient = req.nextUrl.searchParams.get("recipient") || "default";
  const unread = req.nextUrl.searchParams.get("unread") === "true";
  const count = req.nextUrl.searchParams.get("count") === "true";
  const type = req.nextUrl.searchParams.get("type") as NotificationType | null;

  if (count) {
    return NextResponse.json({ recipient, unreadCount: getUnreadCount(recipient) });
  }

  const notifications = getNotifications(recipient, {
    unreadOnly: unread,
    type: type || undefined,
  });

  return NextResponse.json({ recipient, notifications, count: notifications.length });
}

/**
 * POST /api/notifications
 * { action: "read", id }           — mark one as read
 * { action: "read-all", recipient } — mark all as read
 * { action: "prune", days? }       — delete old read notifications
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as string;

  if (action === "read") {
    const id = body.id as number;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    return NextResponse.json({ read: markRead(id) });
  }

  if (action === "read-all") {
    const recipient = body.recipient as string;
    if (!recipient) return NextResponse.json({ error: "recipient required" }, { status: 400 });
    return NextResponse.json({ marked: markAllRead(recipient) });
  }

  if (action === "prune") {
    const days = (body.days as number) || 30;
    return NextResponse.json({ pruned: pruneNotifications(days) });
  }

  return NextResponse.json({ error: "action must be read, read-all, or prune" }, { status: 400 });
}
