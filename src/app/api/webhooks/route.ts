import { NextResponse } from "next/server";
import { getConfiguredWebhooks, getRecentEvents, getWebhookCount } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks — list configured webhooks and recent events
 */
export async function GET() {
  const webhooks = getConfiguredWebhooks().map((w) => ({
    url: w.url,
    events: w.events,
    enabled: w.enabled !== false,
    hasSecret: !!w.secret,
  }));

  return NextResponse.json({
    webhooks,
    activeCount: getWebhookCount(),
    recentEvents: getRecentEvents(10),
  });
}
