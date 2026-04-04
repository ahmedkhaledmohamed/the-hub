import { NextRequest, NextResponse } from "next/server";
import { emit } from "@/lib/events";
import type { HubEventType } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/test — emit a test event to trigger webhooks
 * Body: { event: "scan.complete", data?: { ... } }
 */
export async function POST(req: NextRequest) {
  const { event, data } = await req.json() as {
    event?: HubEventType;
    data?: Record<string, unknown>;
  };

  const validEvents: HubEventType[] = [
    "scan.complete", "artifact.created", "artifact.modified",
    "artifact.deleted", "hygiene.finding", "agent.output",
  ];

  if (!event || !validEvents.includes(event)) {
    return NextResponse.json({
      error: `Invalid event type. Valid types: ${validEvents.join(", ")}`,
    }, { status: 400 });
  }

  await emit(event, {
    ...data,
    test: true,
    triggeredBy: "api",
  });

  return NextResponse.json({
    emitted: true,
    event,
    message: `Event "${event}" emitted. Check configured webhook endpoints for delivery.`,
  });
}
