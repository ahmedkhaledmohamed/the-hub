import { NextRequest } from "next/server";
import { on, off, getRecentEvents } from "@/lib/events";
import type { HubEvent } from "@/lib/events";
import type { HubEventType } from "@/lib/types";

export const dynamic = "force-dynamic";

// Track active SSE connections
let activeConnections = 0;

/**
 * GET /api/events/stream — Server-Sent Events stream for workspace changes.
 *
 * Clients connect and receive real-time events as they occur.
 * Supports optional ?types=artifact.created,scan.completed filtering.
 * Sends a heartbeat every 30 seconds to keep the connection alive.
 *
 * Usage:
 *   const evtSource = new EventSource('/api/events/stream');
 *   evtSource.onmessage = (e) => console.log(JSON.parse(e.data));
 *
 * MCP clients can subscribe to get notified when workspace changes.
 */
export async function GET(req: NextRequest) {
  const typesParam = req.nextUrl.searchParams.get("types");
  const allowedTypes = typesParam ? new Set(typesParam.split(",").map((t) => t.trim())) : null;
  const includeRecent = req.nextUrl.searchParams.get("recent") === "true";

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      activeConnections++;

      // Send initial connection event
      const connectMsg = `data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString(), data: { message: "Subscribed to Hub events" } })}\n\n`;
      controller.enqueue(encoder.encode(connectMsg));

      // Optionally send recent events on connect
      if (includeRecent) {
        const recent = getRecentEvents(10);
        for (const event of recent) {
          if (!allowedTypes || allowedTypes.has(event.type)) {
            const msg = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(msg));
          }
        }
      }

      // Subscribe to all event types we care about
      const eventTypes: HubEventType[] = [
        "artifact.created", "artifact.modified", "artifact.deleted",
        "scan.complete", "hygiene.finding",
      ];

      const handler = (event: HubEvent) => {
        if (closed) return;
        if (allowedTypes && !allowedTypes.has(event.type)) return;
        try {
          const msg = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(msg));
        } catch {
          // Connection may have closed
          closed = true;
        }
      };

      for (const type of eventTypes) {
        on(type, handler);
      }

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 30000);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        closed = true;
        activeConnections--;
        clearInterval(heartbeat);
        for (const type of eventTypes) {
          off(type, handler);
        }
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
