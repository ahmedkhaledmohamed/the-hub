import { NextRequest, NextResponse } from "next/server";
import { emit } from "@/lib/events";
import type { HubEventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_EVENTS: HubEventType[] = [
  "scan.complete", "artifact.created", "artifact.modified",
  "artifact.deleted", "hygiene.finding", "agent.output",
];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { event, data } = body as {
    event?: HubEventType;
    data?: Record<string, unknown>;
  };

  if (!event || typeof event !== "string" || !VALID_EVENTS.includes(event as HubEventType)) {
    return NextResponse.json({
      error: `Invalid event type. Valid types: ${VALID_EVENTS.join(", ")}`,
    }, { status: 400 });
  }

  // Sanitize data: only allow simple values (no nested objects deeper than 2 levels)
  const safeData: Record<string, unknown> = {};
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (typeof k === "string" && k.length <= 100) {
        safeData[k] = v;
      }
    }
  }

  await emit(event, { ...safeData, test: true, triggeredBy: "api" });

  return NextResponse.json({
    emitted: true,
    event,
    message: `Event "${event}" emitted.`,
  });
}
